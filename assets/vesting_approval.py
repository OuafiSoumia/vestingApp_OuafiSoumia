import sys
sys.path.insert(0,'.')

from algobpy.parse import parse_params
from pyteal import *

@Subroutine(TealType.uint64)
def transfer(receiver,asset,amountToWithdraw,amount_available,amount_withdrawn):
    scratchAmount_withdrawn= ScratchVar(TealType.uint64)
    return Seq([
        Assert(basic_checks),
        scratchAmount_withdrawn.store(App.globalGet(amount_withdrawn)),
        Assert(App.globalGet(Bytes("assetID"))==asset),
        Assert((amount_available-scratchAmount_withdrawn.load())>=amountToWithdraw),
        Assert(Txn.fee() == Int(2000)),
        Assert(amountToWithdraw>Int(0)),
        App.globalPut(amount_withdrawn, (amountToWithdraw+scratchAmount_withdrawn.load())),
        InnerTxnBuilder.Begin(),
        InnerTxnBuilder.SetFields({
        TxnField.type_enum: TxnType.AssetTransfer,
        TxnField.asset_receiver: receiver,
        TxnField.asset_amount: amountToWithdraw,
        TxnField.xfer_asset: asset, # Must be in the assets array sent as part of the application call
        TxnField.fee: Int(0),
     }),
     InnerTxnBuilder.Submit(),
     Return(Int(1))
    ])
    
@Subroutine(TealType.uint64)
def withdrawal(amountToWithdraw,allocated_amount,amountWithdrawn):
    scratchDeployed_timestamp= ScratchVar(TealType.uint64)
    scratchDeployed_Allocated_amount= ScratchVar(TealType.uint64)    
    current_month = ScratchVar(TealType.uint64)  
    return Seq([
        Assert(basic_checks),
        scratchDeployed_timestamp.store(App.globalGet(Bytes("deployed_timestamp"))),
        scratchDeployed_Allocated_amount.store(App.globalGet(allocated_amount)),
        current_month.store(((Global.latest_timestamp()-scratchDeployed_timestamp.load())/(SECONDS_IN_ONE_MONTH))),
        Cond(
            # 1day is 86400 seconds so 1 month is 2629743 seconds
            [current_month.load() <= Int(12), Return(Int(0))],
            [current_month.load() > Int(12) and current_month.load() <= Int(24), Return(transfer(Txn.sender(), Txn.assets[0], amountToWithdraw,((current_month.load() - Int(1)) * scratchDeployed_Allocated_amount.load() / Int(24)),amountWithdrawn))],
            [current_month.load() > Int(24), Return(transfer(Txn.sender(), Txn.assets[0], amountToWithdraw, scratchDeployed_Allocated_amount.load(),amountWithdrawn))],
        )
    ])

SECONDS_IN_ONE_MONTH = Int(2629743)

basic_checks= And(
    Txn.rekey_to() == Global.zero_address(),
    Txn.close_remainder_to() == Global.zero_address(),
    Txn.asset_close_to() == Global.zero_address()
)

def vesting_approval():

    assetID = Btoi(Txn.application_args[0])
    handle_creation = Seq([
        Assert(basic_checks),
        App.globalPut(Bytes("assetID"), assetID),
        App.globalPut(Bytes("amount_withdrawn_for_team"), Int(0)),
        App.globalPut(Bytes("amount_withdrawn_for_Advisors"), Int(0)),
        App.globalPut(Bytes("amount_withdrawn_for_PrivateInvestors"), Int(0)),
        App.globalPut(Bytes("amount_withdrawn_for_Company_Reserves"), Int(0)),
        App.globalPut(Bytes("token_distribution_for_team"), (Int(100000000)*Int(15))/Int(100)),
        App.globalPut(Bytes("token_distribution_for_Advisors"), (Int(100000000)*Int(10))/Int(100)),
        App.globalPut(Bytes("token_distribution_for_PrivateInvestors"), (Int(100000000)*Int(20))/Int(100)),
        App.globalPut(Bytes("token_distribution_for_Company_Reserves"), (Int(100000000)*Int(30))/Int(100)),
        App.globalPut(Bytes("deployed_timestamp"), Global.latest_timestamp()),
        App.globalPut(Bytes("Team_address"), Txn.accounts[1]),
        App.globalPut(Bytes("Advisors_address"), Txn.accounts[2]),
        App.globalPut(Bytes("Private_investor_address"), Txn.accounts[3]),
        App.globalPut(Bytes("Company_Reserves_address"), Txn.accounts[4]),
        Return(Int(1))
    ])
    #the vesting contract must do the optin for the asset
    optin_asset=Seq([
        Assert(basic_checks),
        Assert(App.globalGet(Bytes("assetID"))==Txn.assets[0]),
        Assert(Txn.sender() == Global.creator_address()),
        InnerTxnBuilder.Begin(),
        InnerTxnBuilder.SetFields({
        TxnField.type_enum: TxnType.AssetTransfer,
        TxnField.asset_receiver: Global.current_application_address(),
        TxnField.asset_amount: Int(0),
        TxnField.xfer_asset: Txn.assets[0], # Must be in the assets array sent as part of the application call
        }),
        InnerTxnBuilder.Submit(),
        Return(Int(1))
    ])
    
    amountToWithdraw = Btoi(Txn.application_args[1])
    scratchAllocated_amount_companyReserves= ScratchVar(TealType.uint64)
    withdraw=Seq([
        scratchAllocated_amount_companyReserves.store(App.globalGet(Bytes("token_distribution_for_Company_Reserves"))),
        Cond(
             [App.globalGet(Bytes("Company_Reserves_address"))==Txn.sender(), Return(transfer(Txn.sender(),Txn.assets[0],amountToWithdraw,scratchAllocated_amount_companyReserves.load(),Bytes("amount_withdrawn_for_Company_Reserves")))],
             [App.globalGet(Bytes("Team_address"))==Txn.sender(), Return(withdrawal(amountToWithdraw, Bytes("token_distribution_for_team"),Bytes("amount_withdrawn_for_team")))],
             [App.globalGet(Bytes("Advisors_address"))==Txn.sender(), Return(withdrawal(amountToWithdraw, Bytes("token_distribution_for_Advisors"),Bytes("amount_withdrawn_for_Advisors")))],
             [App.globalGet(Bytes("Private_investor_address"))==Txn.sender(), Return(withdrawal(amountToWithdraw, Bytes("token_distribution_for_PrivateInvestors"),Bytes("amount_withdrawn_for_PrivateInvestors")))],
        ),
    ])

    handle_noop = Seq(
         Cond(
            [Txn.application_args[0] == Bytes("optin_asset"), optin_asset],
            [Txn.application_args[0] == Bytes("withdraw"), withdraw],
        )
    )

    handle_optin = Return(Int(0))
    handle_closeout = Return(Int(1))
    handle_updateapp = Return(Int(0))
    handle_deleteapp = Return(Int(0))

    program = Cond(
        [Txn.application_id() == Int(0), handle_creation],
        [Txn.on_completion() == OnComplete.OptIn, handle_optin],
        [Txn.on_completion() == OnComplete.CloseOut, handle_closeout],
        [Txn.on_completion() == OnComplete.UpdateApplication, handle_updateapp],
        [Txn.on_completion() == OnComplete.DeleteApplication, handle_deleteapp],
        [Txn.on_completion() == OnComplete.NoOp, handle_noop]
    )

    return program

if __name__ == "__main__":
    params = {}

    # Overwrite params if sys.argv[1] is passed
    if(len(sys.argv) > 1):
        params = parse_params(sys.argv[1], params)

    print(compileTeal(vesting_approval(), mode=Mode.Application, version=6))