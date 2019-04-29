import React, { Dispatch } from 'react';
import { IMainBannerProps, IMainBannerStates, IMainBanner } from './types/MainBanner';
import { StoreState } from '../store/types';
import { ETHActionType, BlockHeightType, AddressType } from '../actions/types/eth';
import { setBlockHeight, setAccountAddress, setMembership } from '../actions/eth';
import { connect } from 'react-redux';
import { Membership } from '../types';
import { VOTING_CORE_ABI } from '../constants/contractABIs';

const VOTING_CORE_ADDRESS = process.env.REACT_APP_VOTING_CORE_ADDRESS;
class MainBanner extends React.Component<IMainBannerProps, IMainBannerStates> {
    private contract: any;
    private checkBlockNumberInterval: any;
    private checkAccountAddressInterval: any;
    
    constructor(props: IMainBannerProps) {
        super(props);
        this.contract = new this.props.web3.eth.Contract(VOTING_CORE_ABI, VOTING_CORE_ADDRESS);
        this.checkBlockNumberInterval = null;
        this.checkAccountAddressInterval = null;
        this.state = {
            isLoaded: false
        }
    }

    async componentDidMount() {
        this.checkBlockNumberInterval = setInterval(async () => {
            const blockNumber = await this.props.web3.eth.getBlockNumber();
            if (blockNumber !== this.props.blockHeight) {
                this.props.setBlockHeight(blockNumber);
            }
        }, 1000);

        this.checkAccountAddressInterval = setInterval(async () => {
            const accountAddress = await this.props.web3.eth.getAccounts();
            if (accountAddress[0] !== this.props.accountAddress) {
                this.props.setAccountAddress(accountAddress[0]);
                const membership = (await this.contract.methods.getMembership(accountAddress[0]).call()).toNumber();
                this.props.setMembership(membership);
            }
        }, 1000)
    }

    componentWillUnmount() {
        clearInterval(this.checkAccountAddressInterval);
        clearInterval(this.checkBlockNumberInterval);
    }

    showMembership() {
        switch (this.props.membership) {
            case Membership.NO_BODY:
                return 'FREE'
            case Membership.CITIZEN:
                return 'CITIZEN'
            case Membership.DIAMOND:
                return 'DIAMOND'
        }
    }

    render() {
        return (
            <div id="banner">
                <div id="block-height">
                    Block height: { this.props.blockHeight }
                </div>
                <div id="account-address">
                    Account address: { this.props.accountAddress }
                </div>
                <div id="membership">
                    Membership: { this.showMembership() }
                </div>
            </div>
        )
    }
}

const mapStateToProps = (state: StoreState, ownProps: IMainBanner.IInnerProps): IMainBanner.IStateFromProps => {
    return {
        blockHeight: state.ethMisc.blockHeight,
        accountAddress: state.ethMisc.accountAddress,
        membership: state.ethMisc.membership
    }
}

const mapDispatchToProps = (dispatch: Dispatch<ETHActionType>, ownProps: IMainBanner.IInnerProps): IMainBanner.IPropsFromDispatch => {
    return {
        setBlockHeight: (blockHeight: BlockHeightType) => dispatch(setBlockHeight(blockHeight)),
        setAccountAddress: (accountAddress: AddressType) => dispatch(setAccountAddress(accountAddress)),
        setMembership: (nextMembership: Membership) => dispatch(setMembership(nextMembership))
    }
}

export default connect(
    mapStateToProps,
    mapDispatchToProps
)(MainBanner);
