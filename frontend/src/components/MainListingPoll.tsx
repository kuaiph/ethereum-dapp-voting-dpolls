import React, { Dispatch } from "react";
import { connect } from "react-redux";
import { Button, Header, Icon, Item, Loader, Segment } from "semantic-ui-react";
import { setStatistics, removeMonitoringPoll, setSearchResultsAmount } from "../actions/poll";
import { BlockHeightType, AddressType } from "../actions/types/eth";
import { PollActionType } from "../actions/types/poll";
import { VOTING_ABI, VOTING_CORE_ABI } from "../constants/contractABIs";
import { StoreState } from "../store/types";
import style from "./MainListingPoll.module.css";
import PollCard from "./PollCard";
import { IMainListingPoll, IMainListingPollProps, IMainListingPollState, PollInitialMetadata, AdditionalData } from "./types/MainListingPoll";
import { NOTIFICATION_TITLE } from "../constants/project";
import Fuse from "fuse.js";
import { setSearchBar } from "../actions/user";
import { UserActionType } from "../actions/types/user";

const VOTING_CORE_ADDRESS = process.env.REACT_APP_VOTING_CORE_ADDRESS;

class MainListingPoll extends React.Component<IMainListingPollProps, IMainListingPollState> {
    private contract: any;
    private additionalData: AdditionalData[];
    private pollCardsSearchable: number | null;
    private showNoSearchResult: {
        [key: string]: boolean,
        active: boolean,
        inactive: boolean,
    };
    constructor(props: IMainListingPollProps) {
        super(props);
        this.contract = new this.props.web3.eth.Contract(VOTING_CORE_ABI, VOTING_CORE_ADDRESS);
        this.additionalData = [];
        this.pollCardsSearchable = null;
        this.showNoSearchResult = {
            active: false,
            inactive: false,
        };
        this.state = {
            amountPolls: null,
            inactivePolls: null,
            activePolls: null,
            inactiveCollapse: true,
            activeCollapse: true,
            filteredPolls: null,
        };
        this.inactiveCollapseToggle = this.inactiveCollapseToggle.bind(this);
        this.activeCollapseToggle = this.activeCollapseToggle.bind(this);
        this.syncAdditionalData = this.syncAdditionalData.bind(this);
    }

    async componentWillReceiveProps(nextProps: IMainListingPollProps) {
        if (nextProps !== this.props) {
            if (nextProps.userSearchKeywords !== this.props.userSearchKeywords) {
                if (nextProps.userSearchKeywords !== null) {
                    const filteredPolls = this.searchPolls(nextProps.userSearchKeywords);
                    this.props.setSearchResultsAmount(filteredPolls.length);
                    this.setState({
                        filteredPolls,
                    });
                } else {
                    // set to inital state
                    Object.keys(this.showNoSearchResult).forEach((key) => {
                        this.showNoSearchResult[key] = false;
                    });
                    this.props.setSearchResultsAmount(null);
                    this.setState({
                        filteredPolls: null,
                    });
                }
            }
        }
    }

    async componentDidMount() {
        await this.refreshPolls();
        this.pollCardsSearchable = 0;
    }

    async componentDidUpdate(prevProps: IMainListingPollProps) {
        if (this.props !== prevProps) {
            await this.refreshPolls();
        }
    }

    searchPolls(keywords: string) {
        const options: Fuse.FuseOptions<AdditionalData> = {
            keys: ["chairperson", "contractAddress", "title"],
            id: "contractAddress",
        };

        const fuse = new Fuse(this.additionalData, options);
        const results = fuse.search(keywords) as unknown as AddressType[];
        return results;
    }

    syncAdditionalData(address: AddressType, title: string, chairperson: AddressType) {
        if (this.pollCardsSearchable === null) {
            return;
        }

        const beUpdated: AdditionalData = {
            contractAddress: address,
            chairperson,
            title,
        };

        const atIndex = this.additionalData.findIndex((data) => {
            return data.contractAddress === beUpdated.contractAddress;
        });

        if (atIndex !== -1) {
            Object.assign(this.additionalData[atIndex], beUpdated);
        } else {
            this.additionalData.push(beUpdated);
        }

        if (++this.pollCardsSearchable === this.state.amountPolls) {
            this.props.setSearchBar(true);
        }
    }

    async refreshPolls() {
        const data = await this.fetchPolls();

        if (data) {
            const { amountPolls, polls } = data;
            const { activePolls, inactivePolls } = this.filePolls(polls);

            this.props.setPollStatistics(amountPolls, activePolls.length);

            if (this.props.notificationStatus === true) {
                const notifiedVotings: AddressType[] = [];
                polls.forEach((poll) => {
                    if (this.props.monitoring.includes(poll.address)) {
                        notifiedVotings.push(poll.address);

                        const notification = new Notification(NOTIFICATION_TITLE, {
                            body: "Your poll have just been published!",
                        });
                    }
                });

                if (notifiedVotings.length !== 0) {
                    this.props.removeMonitoringPolls(notifiedVotings);
                }
            }

            if (this.state.amountPolls && this.state.amountPolls < amountPolls) {
                this.props.setSearchBar(false);
            }

            this.setState({
                amountPolls,
                activePolls,
                inactivePolls,
            });
        }
    }

    checkIfExpired(blockHeight: BlockHeightType) {
        if (this.props.blockHeight === null) {
            return null;
        }

        const isExpired = (this.props.blockHeight >= blockHeight) ? true : false;
        return isExpired;
    }

    filePolls(polls: PollInitialMetadata[]) {
        const activePolls: PollInitialMetadata[] = [];
        const inactivePolls: PollInitialMetadata[] = [];

        polls.forEach((poll) => {
            (!poll.isExpired) ? activePolls.push(poll) : inactivePolls.push(poll);
        });

        return {
            activePolls,
            inactivePolls,
        };
    }

    async fetchPolls() {
        if (this.props.blockHeight === -1) {
            return null;
        }

        const amountPolls: number = (await this.contract.methods.getAmountVotings().call()).toNumber();
        const awaitingPolls: Array<Promise<PollInitialMetadata>> = [];
        const getPollInitialMetadata = async (index: number) => {
            const address = await this.contract.methods.getVotingItemByIndex(index).call();
            const contract = new this.props.web3.eth.Contract(VOTING_ABI, address);
            const expiryBlockNumber = (await contract.methods.expiryBlockNumber().call()).toNumber();
            const isExpired = this.checkIfExpired(expiryBlockNumber) as boolean;

            const pollInitialMetadata: PollInitialMetadata = {
                address,
                contract,
                expiryBlockNumber,
                isExpired,
            };
            return pollInitialMetadata;
        };
        for (let i = 0; i < amountPolls; i++) {
            awaitingPolls.unshift(getPollInitialMetadata(i));
        }
        const polls = (await Promise.all(awaitingPolls));

        return {
            amountPolls,
            polls,
        };
    }

    inactiveCollapseToggle() {
        this.setState({
            inactiveCollapse: !this.state.inactiveCollapse,
        });
    }

    activeCollapseToggle() {
        this.setState({
            activeCollapse: !this.state.activeCollapse,
        });
    }

    renderFiltered(polls: PollInitialMetadata[], filter: AddressType[], listType: "active" | "inactive") {
        const categoriedPolls = polls.map((pollInitialMetadata) => {
            if (filter.includes(pollInitialMetadata.address)) {
                return Object.assign(pollInitialMetadata, {
                    filtered: true,
                });
            } else {
                return Object.assign(pollInitialMetadata, {
                    filtered: false,
                });
            }
        });

        if (categoriedPolls.filter((pollInitialMetadata) => pollInitialMetadata.filtered === true).length === 0) {
            switch (listType) {
                case "active":
                    this.showNoSearchResult.active = true;
                    break;
                case "inactive":
                    this.showNoSearchResult.inactive = true;
                    break;
                default:
                    throw new Error("Toggle showNoSearchResult off: unsupported list type");
            }

            return (
                categoriedPolls.map((pollInitialMetadata) => {
                    const { address, isExpired, expiryBlockNumber, contract } = pollInitialMetadata;

                    return <PollCard display={false} status="active" web3={this.props.web3} address={address} isExpired={isExpired} expiryBlockNumber={expiryBlockNumber} contract={contract} additionalDataConnecter={this.syncAdditionalData} key={address} />;
                })
            );
        }

        switch (listType) {
            case "active":
                this.showNoSearchResult.active = false;
                break;
            case "inactive":
                this.showNoSearchResult.inactive = false;
                break;
            default:
                throw new Error("Toggle showNoSearchResult on: unsupported list type");
        }
        return (
            categoriedPolls.map((pollInitialMetadata) => {
                const { address, isExpired, expiryBlockNumber, contract, filtered } = pollInitialMetadata;

                return (filtered) ? (
                    <PollCard display={true} status="active" web3={this.props.web3} address={address} isExpired={isExpired} expiryBlockNumber={expiryBlockNumber} contract={contract} additionalDataConnecter={this.syncAdditionalData} key={address} />
                ) : (
                    <PollCard display={false} status="active" web3={this.props.web3} address={address} isExpired={isExpired} expiryBlockNumber={expiryBlockNumber} contract={contract} additionalDataConnecter={this.syncAdditionalData} key={address} />
                );
            })
        );
    }

    renderNoMatchesAvailable() {
        return (
            <Header className={style["no-search-result"]} textAlign="center" size="small">
                <div>
                    No matches found...
                </div>
            </Header>
        );
    }

    renderNoPollsAvailable() {
        return (
            <Segment>
                <Header textAlign="center" size="small">
                    <div>
                        No polls are available...
                    </div>
                </Header>
            </Segment>
        );
    }

    renderComponent() {
        let state: "loading" | "completed" | null = null;

        if (this.state.amountPolls === null) {
            state = "loading";
        } else {
            state = "completed";
        }

        switch (state) {
            case "loading":
                return (
                    <div>
                        <Loader active={true} inline="centered" />
                    </div>
                );
            case "completed":
                if (this.state.amountPolls === 0) {
                    return (
                        <Item.Group>
                            <div className={style["no-poll"]}>
                                <Icon name="archive" size="massive" />
                                <Header>
                                    No poll for now...
                                </Header>
                            </div>
                        </Item.Group>
                    );
                }

                return (
                    <Item.Group divided={true}>
                        <div className={style["inline-container"]}>
                            <div className={style["inline-title"]}>
                                <Header size="large" content="Active Polls" />
                            </div>
                            {
                                (this.state.activePolls && this.state.activePolls.length !== 0) && (
                                    <div className={style["inline-button"]}>
                                        {
                                            (this.state.activeCollapse) ? (
                                                <Button icon={true} onClick={this.activeCollapseToggle}><Icon name="chevron down" size="big" /></Button>
                                            ) : (
                                                    <Button icon={true} onClick={this.activeCollapseToggle}><Icon name="chevron up" size="big" /></Button>
                                                )
                                        }

                                    </div>
                                )
                            }
                        </div>
                        {
                            (this.state.activePolls && this.state.activePolls.length !== 0) ? (
                                <div className={
                                    (this.state.activeCollapse) ? (
                                        [style.collapse, style["active-list"]].join(" ")
                                    ) : (
                                            style["active-list"]
                                        )}>
                                    <Segment>
                                        {
                                            (this.state.filteredPolls !== null) ? this.renderFiltered(this.state.activePolls, this.state.filteredPolls, "active") : (
                                                this.state.activePolls.map((pollInitialMetadata) => {
                                                    const { address, isExpired, expiryBlockNumber, contract } = pollInitialMetadata;
                                                    return (
                                                        <PollCard display={true} status="active" web3={this.props.web3} address={address} isExpired={isExpired} expiryBlockNumber={expiryBlockNumber} contract={contract} additionalDataConnecter={this.syncAdditionalData} key={address} />
                                                    );
                                                })
                                            )
                                        }
                                        {
                                            (this.showNoSearchResult.active) && this.renderNoMatchesAvailable()
                                        }
                                    </Segment>
                                </div>
                            ) : this.renderNoPollsAvailable()
                        }

                        <br />
                        <div className={style["inline-container"]}>
                            <div className={style["inline-title"]}>
                                <Header size="large" content="Expired Polls" />
                            </div>
                            {
                                (this.state.inactivePolls && this.state.inactivePolls.length !== 0) && (
                                    <div className={style["inline-button"]}>
                                        {
                                            (this.state.inactiveCollapse) ? (
                                                <Button icon={true} onClick={this.inactiveCollapseToggle}><Icon name="chevron down" size="big" /></Button>
                                            ) : (
                                                    <Button icon={true} onClick={this.inactiveCollapseToggle}><Icon name="chevron up" size="big" /></Button>
                                                )
                                        }
                                    </div>
                                )
                            }
                        </div>
                        {
                            (this.state.inactivePolls && this.state.inactivePolls.length !== 0) ? (
                                <div className={
                                    (this.state.inactiveCollapse) ? (
                                        [style.collapse, style["inactive-list"]].join(" ")
                                    ) : (
                                            style["inactive-list"]
                                        )}>
                                    <Segment>
                                        {
                                            (this.state.filteredPolls !== null) ? this.renderFiltered(this.state.inactivePolls, this.state.filteredPolls, "inactive") : (
                                                this.state.inactivePolls.map((pollInitialMetadata) => {
                                                    const { address, isExpired, expiryBlockNumber, contract } = pollInitialMetadata;
                                                    return (
                                                        <PollCard display={true} status="inactive" web3={this.props.web3} address={address} isExpired={isExpired} expiryBlockNumber={expiryBlockNumber} contract={contract} additionalDataConnecter={this.syncAdditionalData} key={address} />
                                                    );
                                                })
                                            )
                                        }
                                        {
                                            (this.showNoSearchResult.inactive) && this.renderNoMatchesAvailable()
                                        }
                                    </Segment>
                                </div>
                            ) : this.renderNoPollsAvailable()
                        }
                    </Item.Group>
                );
        }
    }

    render() {
        return this.renderComponent();
    }
}

const mapStateToProps = (state: StoreState, ownProps: IMainListingPoll.IInnerProps): IMainListingPoll.IStateFromProps => {
    return {
        blockHeight: state.ethMisc.blockHeight,
        monitoring: state.pollMisc.monitoring,
        notificationStatus: state.userMisc.notificationStatus,
        userSearchKeywords: state.pollMisc.keywords,
    };
};

const mapDispatchToProps = (dispatch: Dispatch<PollActionType | UserActionType>, ownProps: IMainListingPoll.IInnerProps): IMainListingPoll.IPropsFromDispatch => {
    return {
        setPollStatistics: (amount: number, active: number) => dispatch(setStatistics(amount, active)),
        removeMonitoringPolls: (addresses: AddressType[]) => dispatch(removeMonitoringPoll(addresses)),
        setSearchResultsAmount: (amount: number | null) => dispatch(setSearchResultsAmount(amount)),
        setSearchBar: (enabled: boolean) => dispatch(setSearchBar(enabled)),
    };
};

export default connect(
    mapStateToProps,
    mapDispatchToProps,
)(MainListingPoll);
