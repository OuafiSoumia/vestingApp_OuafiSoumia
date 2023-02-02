<template>
    <div>
        <NavBar
            :sender="sender"
            :network="network"
            :accounts_algosigner="accounts_algosigner"
            @setNetwork="setNetwork"
            @disconnectWallet="disconnectWallet"
            @connectMyAlgo="connectMyAlgo"
            @connectToAlgoSigner="connectToAlgoSigner"
            @connectToWalletConnect="connectToWalletConnect"
            @connected_account="connected_account"
        />
        <div id="home" class="container-sm mt-5">
            <send-asset-form
                v-if="this.sender !== ''"
                :connection="this.connection"
                :network="this.network"
                :sender="this.sender"
                :accounts_algosigner="this.accounts_algosigner"
                :asset_looked="asset_looked"
                :num_withdrawable="num_withdrawable"
                @connected_account="connected_account"
            />   
        </div>
    </div>
</template>

<script>
import MyAlgoConnect from "@randlabs/myalgo-connect";
import WalletConnect from "@walletconnect/client";
import QRCodeModal from "@walletconnect/qrcode-modal";
import configHolding from "../artifacts/mint_asset.js.cp.yaml"; 
import { getAlgodClient } from "../client.js";

export default {
    data() {
        return {
            connection: "", // myalgo | walletconnect | algosigner
            connector: null, // wallet connector obj
            network: "Localhost", // Localhost | TestNet
            sender: "", // connected account
            accounts_algosigner : [],
            asset_looked: 0,
            num_withdrawable: 0,
            senderInfo: null,
            algodClient: getAlgodClient(this.network),
            asset_id: configHolding.default.metadata.globalStateVesting.assetID,
            account_connected:configHolding.default.metadata,
            deployed_timestamp: configHolding.default.metadata.globalStateVesting.deployed_timestamp,
            vestingAppid:configHolding.default.metadata.vesting_appid,
        };
    },
    methods: {
        setNetwork(network) {
            this.disconnectWallet();
            this.network = network;
        },
        disconnectWallet() {
            this.connection = ""; 
            this.connector = null;
            this.sender = "";
        },
        async connectMyAlgo() {
            try {
                // force connection to TestNet
                this.network = "TestNet";

                const myAlgoWallet = new MyAlgoConnect();
                const accounts = await myAlgoWallet.connect();
                this.sender = accounts[0].address;
                this.connection = "myalgo";
            } catch (err) {
                console.error(err);
            }
        },
        async connectToAlgoSigner() {
            const AlgoSigner = window.AlgoSigner;

            if (typeof AlgoSigner !== "undefined") {
                await AlgoSigner.connect();
                const accounts = await AlgoSigner.accounts({
                    ledger: this.network,
                });

                if (this.network === "Localhost") {
                    // use non-creator address
                    this.sender = accounts[1].address;
                } else {
                    this.sender = accounts[0].address;
                }
                
                this.accounts_algosigner = accounts;
                this.connection = "algosigner";
                this.connected_account(this.sender);
            }
        },
        async connectToWalletConnect() {
            // force connection to TestNet
            this.network = "TestNet";

            // Create a connector
            this.connector = new WalletConnect({
                bridge: "https://bridge.walletconnect.org", // Required
                qrcodeModal: QRCodeModal,
            });

            // Kill existing session
            if (this.connector.connected) {
                await this.connector.killSession();
            }

            this.connector.createSession();

            // Subscribe to connection events
            this.connector.on("connect", (error, payload) => {
                if (error) {
                    throw error;
                }

                const { accounts } = payload.params[0];
                this.sender = accounts[0];
                this.connection = "walletconnect";
            });

            this.connector.on("session_update", (error, payload) => {
                if (error) {
                    throw error;
                }

                const { accounts } = payload.params[0];
                this.sender = accounts[0];
                this.connection = "walletconnect";
            });

            this.connector.on("disconnect", (error, payload) => {
                if (error) {
                    throw error;
                }

                // Delete connector
                console.log(payload);
                this.sender = "";
                this.connection = "";
            });
        },
        async connected_account(sender) {
            if(sender == this.account_connected.teamAddr){
                this.change_sender(sender,configHolding.default.metadata.globalStateVesting.token_distribution_for_team,"amount_withdrawn_for_team");                
            }
            else if(sender == this.account_connected.privateInvestorsAddr){
                this.change_sender(sender,configHolding.default.metadata.globalStateVesting.token_distribution_for_PrivateInvestors,"amount_withdrawn_for_PrivateInvestors");                
            }
            else if(sender == this.account_connected.advisorsAddr){
                this.change_sender(sender,configHolding.default.metadata.globalStateVesting.token_distribution_for_Advisors,"amount_withdrawn_for_Advisors");                                
            }

            else if(sender == this.account_connected.companyAddr){
                this.change_sender(sender,configHolding.default.metadata.globalStateVesting.token_distribution_for_Company_Reserves,"amount_withdrawn_for_Company_Reserves");                                                
            }
        },
        
        async change_sender(sender,asset_looked,amount_withrawn){
                this.num_withdrawable=0;
                this.sender = sender;
                this.asset_looked=asset_looked;
                this.amount_available(this.asset_looked);
                let applicationInfoResponse = await this.algodClient.getApplicationByID(this.vestingAppid).do();
                applicationInfoResponse['params']['global-state'].forEach(element => {
                    if(window.btoa(amount_withrawn)==element['key']){
                        this.num_withdrawable -= element.value.uint;
                    }
                });
                
        },

        amount_available(distribution_token){
            if(distribution_token==configHolding.default.metadata.globalStateVesting.token_distribution_for_Company_Reserves){
                this.num_withdrawable = distribution_token;
                return;
            }   
            let today = Math.floor(Date.now()/1000);
            let num_month = parseInt((today-this.deployed_timestamp)/2629743);
            if(num_month<=12){
                this.num_withdrawable = 0;
            }else if(num_month>24){
                this.num_withdrawable = distribution_token;
            }else{
                this.num_withdrawable = parseInt(((num_month-1)/24)*distribution_token);
            }
        },
    },
};
</script>
