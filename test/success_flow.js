const { types } = require("@algo-builder/web");
const { assert, expect } = require("chai");
const { Runtime, AccountStore, ERRORS } = require("@algo-builder/runtime");
const algosdk = require("algosdk");
const { convert } = require("@algo-builder/algob");

const approvalFileMint = "mint_approval.py";
const clearStateFileMint = "mint_clearstate.py";

const approvalFileVesting = "vesting_approval.py";
const clearStateFileVesting = "vesting_clearstate.py";

describe("Success Flow", function () {
    // Write your code here
    let master;
    let runtime;
    let appInfoMint;
    let TeamAcc;
    let advisorsAcc;
    let PrivateinvestorAcc;
    let companyReserveAcc;

    // do this before each test
    this.beforeEach(async function () {
        master = new AccountStore(1e9); //1000 Algos
        TeamAcc = new AccountStore(1e9); //100 Algos
        advisorsAcc = new AccountStore(1e9); //100 Algos
        PrivateinvestorAcc = new AccountStore(1e9); //100 Algos
        companyReserveAcc = new AccountStore(1e9); //100 Algos
        runtime = new Runtime([master,TeamAcc,advisorsAcc,PrivateinvestorAcc,companyReserveAcc]);
    });

    const initContract = (runtime, creatorAccount, approvalFile, clearStateFile, locInts, locBytes, gloInts, gloBytes, args,account) => {
        // create new app
        runtime.deployApp(
            approvalFile,
            clearStateFile,
            {
                sender: creatorAccount,
                localInts: locInts,
                localBytes: locBytes,
                globalInts: gloInts,
                globalBytes: gloBytes,
                appArgs: args,
                accounts: account,
            },
            { totalFee: 1000 }, //pay flags
        );

        const appInfo = runtime.getAppInfoFromName(approvalFile, clearStateFile);
        const appAddress = appInfo.applicationAccount;  

        // fund the contract
        runtime.executeTx({
            type: types.TransactionType.TransferAlgo,
            sign: types.SignType.SecretKey,
            fromAccount: creatorAccount, //use the account object
            toAccountAddr: appAddress, //app address
            amountMicroAlgos: 2e7, //20 algos
            payFlags: { totalFee: 1000 },
        });

        return appInfo;
    };

    const initMint = () => {
        return initContract(
            runtime, 
            master.account, 
            approvalFileMint, 
            clearStateFileMint,
            0,
            0,
            1,
            1,
            [],
            []
        );
    };


    const initVesting = (ID) => {
        return initContract(
            runtime, 
            master.account, 
            approvalFileVesting, 
            clearStateFileVesting,
            0,
            0,
            10,
            4,
            [convert.uint64ToBigEndian(ID)],
            [TeamAcc.account.addr,advisorsAcc.account.addr,PrivateinvestorAcc.account.addr,companyReserveAcc.account.addr],
        );
    };

    const optIn = (runtime, account, appID, asset) => {
        const optinAsset = ["optin_asset"].map(convert.stringToBytes);
        runtime.executeTx({
            type: types.TransactionType.CallApp,
            sign: types.SignType.SecretKey,
            fromAccount: account,
            appID: appID,
            payFlags: { totalFee: 1000 },
            foreignAssets: [asset],
            appArgs: optinAsset,
        });
    };

    const optInUser = (runtime, account, asset) => {
        runtime.executeTx({
            type: types.TransactionType.OptInASA,
            sign: types.SignType.SecretKey,
            fromAccount: account,
            assetID: asset,
            payFlags: { totalFee: 1000 },
        });
    };
    
    const amountToSendTransfer = 75000000;
    const Testtransfer = (runtime, account, appID, appAccount, assets) => {
        const transfer = [convert.stringToBytes("transfer_token"),convert.uint64ToBigEndian(amountToSendTransfer)];
        runtime.executeTx({
            type: types.TransactionType.CallApp,
            sign: types.SignType.SecretKey,
            fromAccount: account,
            appID: appID,
            payFlags: { totalFee: 1000 },
            accounts: [appAccount],
            foreignAssets: [assets],
            appArgs: transfer,
        });
    };

    const withdraw = (runtime, account, appID, assets,amouttowithdrawal) => {
        const withdraw = [convert.stringToBytes("withdraw"),convert.uint64ToBigEndian(amouttowithdrawal)];
        runtime.executeTx({
            type: types.TransactionType.CallApp,
            sign: types.SignType.SecretKey,
            fromAccount: account,
            appID: appID,
            payFlags: { totalFee: 2*algosdk.ALGORAND_MIN_TX_FEE },
            foreignAssets: [assets],
            appArgs: withdraw,
        });
    };


    const createdAsset = () => {
        const appID1 = appInfoMint.appID;

        //create asset
        const createAsset = ["create_asset"].map(convert.stringToBytes);
        runtime.executeTx({
            type: types.TransactionType.CallApp,
            sign: types.SignType.SecretKey,
            fromAccount: master.account,
            appID: appID1,
            payFlags: { totalFee: 1000 },
            appArgs: createAsset,
        });

        //get asset ID
        const getGlobal = (appID, key) => runtime.getGlobalState(appID, key);
        const assetID = Number(getGlobal(appID1, "VACid"));
        //console.log(assetID);

        return assetID;
    }

    it("Deploys mint contract successfully", () => {
        const appInfo = initMint();
        const appID = appInfo.appID;

        // verify app created
        assert.isDefined(appID);

        // verify app funded
        const appAccount = runtime.getAccount(appInfo.applicationAccount);
        assert.equal(appAccount.amount, 2e7);

    }).timeout(10000);

    it("asset created successfully", () => {
        appInfoMint = initMint();
        const ID = createdAsset();
        // verify assetID
        assert.isDefined(ID);

    }).timeout(10000);


    it("Deploys vesting contract successfully", () => {
        appInfoMint = initMint();
        const ID = createdAsset();
        const appInfoVesting = initVesting(ID);
        const appID = appInfoVesting.appID;

        // verify app created
        assert.isDefined(appID);

        // verify app funded
        const appAccount = runtime.getAccount(appInfoVesting.applicationAccount);
        assert.equal(appAccount.amount, 2e7);

    }).timeout(10000);


    it("Vesting contract opts in successfully", () => {
        appInfoMint = initMint();
        const ID = createdAsset();
        const appInfoVesting= initVesting(ID);

        // do opt in
        optIn(runtime, master.account, appInfoVesting.appID, ID);

    }).timeout(10000);

    it("Transfer successfully" , () => {
        appInfoMint = initMint();
        const ID = createdAsset();
        const appInfoVesting= initVesting(ID);

        optIn(runtime, master.account, appInfoVesting.appID, ID);
        
        //update price
        Testtransfer(runtime,master.account,appInfoMint.appID,appInfoVesting.applicationAccount,ID);

        const appAccount = runtime.getAccount(appInfoVesting.applicationAccount);
        //check new price
        assert.equal(Number(appAccount.assets.get(ID).amount),75000000);

    }).timeout(10000);
    
    
    it("withraw for Company_Reserves successfully" , () => {
        appInfoMint = initMint();
        const ID = createdAsset();
        const appInfoVesting= initVesting(ID);
        optIn(runtime,master.account,appInfoVesting.appID,ID);
        
        //update price
        Testtransfer(runtime,master.account,appInfoMint.appID,appInfoVesting.applicationAccount,ID);

        optInUser(runtime,companyReserveAcc.account,ID);
        
        withdraw(runtime,companyReserveAcc.account,appInfoVesting.appID,ID,10);

    }).timeout(10000);

    it("Stakeholders (less reserves) can withdraw 50% on month 13" , () => {
        appInfoMint = initMint();
        const ID = createdAsset();
        const appInfoVesting= initVesting(ID);
       
        optIn(runtime,master.account,appInfoVesting.appID,ID);
        
        Testtransfer(runtime,master.account,appInfoMint.appID,appInfoVesting.applicationAccount,ID);

        optInUser(runtime,advisorsAcc.account,ID);
        optInUser(runtime,TeamAcc.account,ID);
        optInUser(runtime,PrivateinvestorAcc.account,ID);

         //1day is 86400 seconds so 1 month is 2629743 seconds
         runtime.setRoundAndTimestamp(4,1 + (13 * 2629743));
         const getGlobal = (appID, key) => runtime.getGlobalState(appID, key);

         let advisorAllocation = getGlobal(appInfoVesting.appID, "token_distribution_for_Advisors");
         let withdrawAmt = Math.floor((12 * Number(advisorAllocation))/ 24);
        withdraw(runtime,advisorsAcc.account,appInfoVesting.appID,ID,withdrawAmt);

        let teamAllocation = getGlobal(appInfoVesting.appID, "token_distribution_for_team");
        withdrawAmt = Math.floor((12 * Number(teamAllocation)) /24);
        withdraw(runtime,TeamAcc.account,appInfoVesting.appID,ID,withdrawAmt);

        let PrivateinvestorAllocation = getGlobal(appInfoVesting.appID, "token_distribution_for_PrivateInvestors");
        withdrawAmt = Math.floor((12 * Number(PrivateinvestorAllocation))/24 );
        withdraw(runtime,PrivateinvestorAcc.account,appInfoVesting.appID,ID,withdrawAmt);

    }).timeout(10000);

    it("Stakeholders can withdraw full amount on month 25" , () => {
        appInfoMint = initMint();
        const ID = createdAsset();
        const appInfoVesting= initVesting(ID);
        
        optIn(runtime,master.account,appInfoVesting.appID,ID);
        
        Testtransfer(runtime,master.account,appInfoMint.appID,appInfoVesting.applicationAccount,ID);

        optInUser(runtime,advisorsAcc.account,ID);
        optInUser(runtime,PrivateinvestorAcc.account,ID);
        optInUser(runtime,TeamAcc.account,ID);

        // 1day is 86400 seconds so 1 month is 2629743 seconds
        runtime.setRoundAndTimestamp(4,1 + (25 * 2629743));
        const getGlobal = (appID, key) => runtime.getGlobalState(appID, key);

        let advisorAllocation = getGlobal(appInfoVesting.appID, "token_distribution_for_Advisors");
        withdraw(runtime,advisorsAcc.account,appInfoVesting.appID,ID,Number(advisorAllocation));
        let teamAllocation = getGlobal(appInfoVesting.appID, "token_distribution_for_Advisors");
        withdraw(runtime,TeamAcc.account,appInfoVesting.appID,ID,Number(teamAllocation));
        let PrivateinvestorAllocation = getGlobal(appInfoVesting.appID, "token_distribution_for_Advisors");
        withdraw(runtime,PrivateinvestorAcc.account,appInfoVesting.appID,ID,Number(PrivateinvestorAllocation));


    }).timeout(10000);
    

});
