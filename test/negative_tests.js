const { types } = require("@algo-builder/web");
const { assert, expect } = require("chai");
const { Runtime, AccountStore, ERRORS } = require("@algo-builder/runtime");
const algosdk = require("algosdk");
const { convert } = require("@algo-builder/algob");

const approvalFileMint = "mint_approval.py";
const clearStateFileMint = "mint_clearstate.py";

const approvalFileVesting = "vesting_approval.py";
const clearStateFileVesting = "vesting_clearstate.py";

const RUNTIME_ERR1009 = 'RUNTIME_ERR1009: TEAL runtime encountered err opcode'; 
const RUNTIME_ERR1007 = 'RUNTIME_ERR1007: Teal code rejected by logic'; 

describe("Negative Tests", function () {
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

    const withdraw = (runtime, account, appID, assets, amount,fees) => {
        const withdraw = [convert.stringToBytes("withdraw"),convert.uint64ToBigEndian(amount)];
        runtime.executeTx({
            type: types.TransactionType.CallApp,
            sign: types.SignType.SecretKey,
            fromAccount: account,
            appID: appID,
            payFlags: { totalFee: fees },
            foreignAssets: [assets],
            appArgs: withdraw,
        });
    };


    const createdAsset = (account) => {
        const appID1 = appInfoMint.appID;

        //create asset
        const createAsset = ["create_asset"].map(convert.stringToBytes);
        runtime.executeTx({
            type: types.TransactionType.CallApp,
            sign: types.SignType.SecretKey,
            fromAccount: account,
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
    
    it("Double asset creation fails", () => {
        appInfoMint = initMint();
        
        // create asste 
        let assetID = createdAsset(master.account);

        // create asste again
        assert.throws(() => { const assetID = createdAsset(master.account) }, RUNTIME_ERR1009);
    }).timeout(10000);

    it("Asset creation fails when non-creator calls", () => {
        appInfoMint = initMint();
        
        // create asste 
        assert.throws(() => { const assetID = createdAsset(TeamAcc.account) }, RUNTIME_ERR1009);
    }).timeout(10000);

    it("Asset transfer fails when non-creator calls" , () => {
        appInfoMint = initMint();
        const assetID = createdAsset(master.account);
        const appInfoVesting = initVesting(assetID);

        // do opt in
        optIn(runtime, master.account, appInfoVesting.appID, assetID);

        assert.throws(() => { Testtransfer(runtime,TeamAcc.account,appInfoMint.appID,appInfoVesting.applicationAccount,assetID) }, RUNTIME_ERR1009);

    }).timeout(10000);

    it("withdrawal the token before the cliff" , () => {
        appInfoMint = initMint();
        const assetID = createdAsset(master.account);
        const appInfoVesting = initVesting(assetID);

        optIn(runtime, master.account, appInfoVesting.appID, assetID);

        Testtransfer(runtime,master.account,appInfoMint.appID,appInfoVesting.applicationAccount,assetID);

        // do opt in
        optInUser(runtime, advisorsAcc.account, assetID);
        
        let amount=10;
        assert.throws(() =>{withdraw(runtime,advisorsAcc.account,appInfoVesting.appID,assetID,amount,2000)}, RUNTIME_ERR1007);
    }).timeout(10000);

    it("withdrawal the token for company reserve but amount > amount availble to withraw" , () => {
        appInfoMint = initMint();
        const assetID = createdAsset(master.account);
        const appInfoVesting = initVesting(assetID);

        optIn(runtime, master.account, appInfoVesting.appID, assetID);

        Testtransfer(runtime,master.account,appInfoMint.appID,appInfoVesting.applicationAccount,assetID);

        // do opt in
        optInUser(runtime, companyReserveAcc.account, assetID);

        let amount=31000000;
        assert.throws(() =>{withdraw(runtime,companyReserveAcc.account,appInfoVesting.appID,assetID,amount,2000)}, RUNTIME_ERR1009);
    }).timeout(10000);

    it("Withdraw fails if there is no payment to cover inner txn fees." , () => {
        appInfoMint = initMint();
        const assetID = createdAsset(master.account);
        const appInfoVesting = initVesting(assetID);

        optIn(runtime, master.account, appInfoVesting.appID, assetID);

        Testtransfer(runtime,master.account,appInfoMint.appID,appInfoVesting.applicationAccount,assetID);

        // do opt in
        optInUser(runtime, companyReserveAcc.account, assetID);

        let amount=10;
        assert.throws(() =>{withdraw(runtime,companyReserveAcc.account,appInfoVesting.appID,assetID,amount,1000)}, RUNTIME_ERR1009);
    }).timeout(10000);

    it("Stakeholders cannot withdraw 0 tokens." , () => {
        appInfoMint = initMint();
        const assetID = createdAsset(master.account);
        const appInfoVesting = initVesting(assetID);

        optIn(runtime, master.account, appInfoVesting.appID, assetID);

        Testtransfer(runtime,master.account,appInfoMint.appID,appInfoVesting.applicationAccount,assetID);

        // do opt in
        optInUser(runtime, companyReserveAcc.account, assetID);

        let amount=0;
        assert.throws(() =>{withdraw(runtime,companyReserveAcc.account,appInfoVesting.appID,assetID,amount,2000)}, RUNTIME_ERR1009);
    }).timeout(10000);

    it("Stakeholders cannot withdraw an amount exceeding their accumulated allocation for that month, if they have already withdrawn a partial amount." , () => {
        appInfoMint = initMint();
        const assetID = createdAsset(master.account);
        const appInfoVesting = initVesting(assetID);
        
        optIn(runtime, master.account, appInfoVesting.appID, assetID);

        Testtransfer(runtime,master.account,appInfoMint.appID,appInfoVesting.applicationAccount,assetID);

       // do opt in
        optInUser(runtime, advisorsAcc.account, assetID);

        // 1day is 86400 seconds so 1 month is 2629743 seconds
        runtime.setRoundAndTimestamp(4,1 + (16 * 2629743));
        
        const getGlobal = (appID, key) => runtime.getGlobalState(appID, key);
        let advisorAllocation = getGlobal(appInfoVesting.appID, "token_distribution_for_Advisors");
        let withdrawAmt = Math.floor((15 * Number(advisorAllocation))/ 24);

        withdraw(runtime,advisorsAcc.account,appInfoVesting.appID,assetID,withdrawAmt,2000);
    
        assert.throws(() =>{withdraw(runtime,advisorsAcc.account,appInfoVesting.appID,assetID,1,2000)}, RUNTIME_ERR1009);
    }).timeout(10000);
   
    
});
