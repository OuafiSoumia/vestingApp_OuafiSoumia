const { executeTransaction, convert, readAppGlobalState } = require("@algo-builder/algob");
const { types } = require("@algo-builder/web");

async function run(runtimeEnv, deployer) {
    const master = deployer.accountsByName.get("master");
    const mint_approval = "mint_approval.py";
    const mint_clearstate = "mint_clearstate.py";
    const vesting_approval = "vesting_approval.py";
    const vesting_clearstate = "vesting_clearstate.py";

    await deployer.deployApp(
        mint_approval,
        mint_clearstate,
        {
            sender: master,
            localInts: 0,
            localBytes: 0,
            globalInts: 1,
            globalBytes: 1,
        },
        { totalFee: 1000 }
    );

    // get app info
    const app_mint = deployer.getApp(mint_approval, mint_clearstate);

    // fund contract with some algos to handle inner txn
    await executeTransaction(deployer, {
        type: types.TransactionType.TransferAlgo,
        sign: types.SignType.SecretKey,
        fromAccount: master,
        toAccountAddr: app_mint.applicationAccount,
        amountMicroAlgos: 1e7, //10 algos
        payFlags: { totalFee: 1000 },
    });

    const createAsset = ["create_asset"].map(convert.stringToBytes);
    const mint_appID = app_mint.appID;

    await executeTransaction(deployer, {
        type: types.TransactionType.CallApp,
        sign: types.SignType.SecretKey,
        fromAccount: master,
        appID: mint_appID,
        payFlags: { totalFee: 1000 },
        appArgs: createAsset,
    });

    let globalState_mint = await readAppGlobalState(deployer, master.addr, mint_appID);
    const assetID = globalState_mint.get("VACid");

    //checkpoint for mint 
    deployer.addCheckpointKV("mint_appid", mint_appID);
    deployer.addCheckpointKV("mint_appAdress", app_mint.applicationAccount);

    await deployer.deployApp(
        vesting_approval,
        vesting_clearstate,
        {
            sender: master,
            localInts: 0,
            localBytes: 0,
            globalInts: 11,
            globalBytes: 4,
            appArgs: [convert.uint64ToBigEndian(assetID)],
            accounts: [deployer.accountsByName.get("team").addr,deployer.accountsByName.get("advisors").addr,deployer.accountsByName.get("private_investors").addr,deployer.accountsByName.get("company_reserves").addr],
        },
        { totalFee: 1000 }
    );
    
    const app_vesting = deployer.getApp(vesting_approval, vesting_clearstate);

    await executeTransaction(deployer, {
        type: types.TransactionType.TransferAlgo,
        sign: types.SignType.SecretKey,
        fromAccount: master,
        toAccountAddr: app_vesting.applicationAccount,
        amountMicroAlgos: 1e7, //10 algos
        payFlags: { totalFee: 1000 },
    });

    const vesting_appID = app_vesting.appID;
    const optinAsset = ["optin_asset"].map(convert.stringToBytes);

    await executeTransaction(deployer, {
        type: types.TransactionType.CallApp,
        sign: types.SignType.SecretKey,
        fromAccount: master,
        appID: vesting_appID,
        payFlags: { totalFee: 1000 },
        foreignAssets: [assetID],
        appArgs: optinAsset,
    });

    //checkpoint for vesting 
    deployer.addCheckpointKV("vesting_appid", vesting_appID);
    deployer.addCheckpointKV("vesting_appAdress", app_vesting.applicationAccount);

    let appAccountMint = await deployer.algodClient.accountInformation(app_mint.applicationAccount).do();

    const transfer_token = [convert.stringToBytes("transfer_token"),convert.uint64ToBigEndian((appAccountMint.assets[0].amount*75)/100)];
    
    await executeTransaction(deployer, {
        type: types.TransactionType.CallApp,
        sign: types.SignType.SecretKey,
        fromAccount: master,
        appID: mint_appID,
        payFlags: { totalFee: 1000 },
        accounts: [app_vesting.applicationAccount],
        foreignAssets: [assetID],
        appArgs: transfer_token,
    });

    deployer.addCheckpointKV("teamAddr", deployer.accountsByName.get("team").addr);
    deployer.addCheckpointKV("advisorsAddr", deployer.accountsByName.get("advisors").addr);
    deployer.addCheckpointKV("privateInvestorsAddr", deployer.accountsByName.get("private_investors").addr);
    deployer.addCheckpointKV("companyAddr", deployer.accountsByName.get("company_reserves").addr);

    console.log("Mint contraact");
    console.log(appAccountMint);
    console.log("vesting contraact");
    let appAccountvesting = await deployer.algodClient.accountInformation(app_vesting.applicationAccount).do();
    console.log(appAccountvesting);
    console.log("vesting global state");
    let globalStateVesting = await readAppGlobalState(deployer, master.addr, vesting_appID);
    console.log(globalStateVesting);
    deployer.addCheckpointKV("globalStateVesting", globalStateVesting);
}

module.exports = { default: run };
