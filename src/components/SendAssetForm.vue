<template>
    <div id="buyasset" class="mb-5">
        <h3>Withdraw your VACoin</h3>
        <div
            v-if="this.acsTxId !== ''"
            class="alert alert-success"
            role="alert"
        >
            Txn Ref:
            <a :href="explorerURL" target="_blank">{{ this.acsTxId }}</a>
        </div>
        <p>VACoin coins left: {{ this.asset_looked }}</p> 
        
        <p>maximum number of withdrawable tokens: {{ this.num_withdrawable }}</p>
        <form
            action="#"
            @submit.prevent="handleOptIn"
        >
            <div class="mb-3">
                <label for="asset_amount" class="form-label"
                    >Please do opt In first!!</label
                >

            </div>
            <button type="submit" class="btn btn-primary">Opt IN</button>
        </form>
        <form
            action="#"
            @submit.prevent="handleWithdraw"
        >
        <div class="mb-3">
                <label for="asset_amount" class="form-label"
                    >Withdraw your token!!</label
                >
                <input
                    type="number"
                    class="form-control"
                    id="asset_amount"
                    v-model="asset_amount"
                />
            </div>
            <button type="submit" class="btn btn-primary">Withdraw</button>
        </form>
    </div>
</template>

<script>
import algosdk from 'algosdk';
//import { createDecipheriv } from 'crypto';
import { getAlgodClient } from "../client.js";
import * as helpers from '../helpers';
import configHolding from "../artifacts/mint_asset.js.cp.yaml"; 
import wallets from "../wallets.js";


export default {
    props: {
        connection: String,
        network: String,
        sender: String,
        accounts_algosigner: Array,
        asset_looked: Number,
        num_withdrawable: Number,
    },
    data() {
        return {
            acsTxId: "",
            asset_amount: 0,
            explorerURL: "",
            algodClient: null,
            vestingAppAdress: null,
            vestingAppid: null,
            asset_id: 0,
        };
    },
    async created(){
        this.algodClient = getAlgodClient(this.network);
        const VestingApp = configHolding.default.metadata;
        this.vestingAppAdress = VestingApp.vesting_appAdress;
        this.vestingAppid = VestingApp.vesting_appid;
        this.asset_id=configHolding.default.metadata.globalStateVesting.assetID;
    },
    methods: {
        async updateTxn(value) {
            this.acsTxId = value;
            this.explorerURL = helpers.getExplorerURL(this.acsTxId, this.network);
        },
        async handleOptIn() {
            // write code here
            let senderInfo = await this.algodClient.accountInformation(this.sender).do();
            
            let params = await this.algodClient.getTransactionParams().do();
            params.fee = 1000
            params.flatFee = true

            for(let i=0; i<=senderInfo.assets.length; i++){
                
                if(typeof senderInfo.assets[i] === 'undefined' || (senderInfo.assets[i]['asset-id'] !== this.asset_id && i === senderInfo.assets.length -1)){
                    
                    let txn1 = algosdk.makeAssetTransferTxnWithSuggestedParams(
                        this.sender,
                        this.sender,
                        undefined,
                        undefined,
                        0,
                        undefined,
                        this.asset_id,
                        params
                    );
                    await wallets.sendAlgoSignerTransaction([txn1], this.algodClient);
                    this.$emit("connected_account",this.sender);
                    break;
                }

                else if(senderInfo.assets[i]['asset-id'] === this.asset_id){
                    break;
                }
            }
                  
        },
        async handleWithdraw(){
            let senderInfo = await this.algodClient.accountInformation(this.sender).do();
            
            let params = await this.algodClient.getTransactionParams().do();
            params.fee = 2* algosdk.ALGORAND_MIN_TX_FEE
            params.flatFee = true
            if(senderInfo.assets.length>0){
                for(let i=0; i<senderInfo.assets.length; i++){

                    if(senderInfo.assets[i]['asset-id'] === this.asset_id){

                        let appArgs = [new Uint8Array(Buffer.from("withdraw")), algosdk.encodeUint64(Number(this.asset_amount))];

                        let txn1 = algosdk.makeApplicationNoOpTxn(this.sender, params, this.vestingAppid,appArgs,undefined,undefined,[this.asset_id]);

                        let Txn = await wallets.sendAlgoSignerTransaction([txn1], this.algodClient);
                        if(Txn){
                            this.updateTxn(Txn.txId);
                            this.$emit("connected_account",this.sender);
                        }
                            
                        break;
                    }
                }
            }
            
        }
    },
};
</script>
