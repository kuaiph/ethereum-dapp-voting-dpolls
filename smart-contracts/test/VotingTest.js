const catchRevert = require('./helper/exception').catchRevert;
const Voting = artifacts.require('./Voting');


contract("Voting", function(accounts) {
    /**
     * Test accounts
     */
    let testingAccountContractAdmin;
    let testingAccountVoter1;
    let testingAccountVoter2;
    let testingAccountVoter3;
    let testingAccountVoter4;

    let title;
    let titleHex;
    let optionsAmount;
    let optionTitles;
    let optionTitlesHex;
    let expiryBlockNumber;
    let VotingInstance;

    /**
     * Votes associated with each person
     */
    let votedOption1;
    let votedOption2;
    let votedOption3;
    let votedOption4;

    let startWithBlockNumber;

    beforeEach('setup contract for each test', async () => {
        testingAccountContractAdmin = accounts[0];
        testingAccountVoter1 = accounts[1];
        testingAccountVoter2 = accounts[2];
        testingAccountVoter3 = accounts[3];
        testingAccountVoter4 = accounts[4];
        title = 'Who is the best?';
        titleHex = web3.utils.utf8ToHex(title);
        optionTitles = ['Allen', 'Bob', 'Alice'];
        optionTitlesHex = optionTitles.map(title => web3.utils.utf8ToHex(title));
        optionsAmount = optionTitles.length;
        startWithBlockNumber = await web3.eth.getBlockNumber()
        expiryBlockNumber = startWithBlockNumber + 1 + 1 + 3; // ahead by 5 blocks;
        VotingInstance = await Voting.new(titleHex, optionTitlesHex, expiryBlockNumber, testingAccountContractAdmin, {from: testingAccountContractAdmin});
    });

    it("should remain in initial state", async () => {
        const isExpired = await VotingInstance.isExpired();
        assert.equal(isExpired, false);
        const _optionsAmount = await VotingInstance.optionsAmount();
        assert.equal(_optionsAmount, optionsAmount);
        const currentVotes = await VotingInstance.votesAmount();
        assert.equal(currentVotes, 0);
    });

    it("people can see all options and its title", async () => {
        assert.equal(web3.utils.hexToUtf8(await VotingInstance.title()), title);
        assert.equal(web3.utils.hexToUtf8(await VotingInstance.getOptionTitleByIndex(0)), optionTitles[0]);
        assert.equal(web3.utils.hexToUtf8(await VotingInstance.getOptionTitleByIndex(1)), optionTitles[1]);
        assert.equal(web3.utils.hexToUtf8(await VotingInstance.getOptionTitleByIndex(2)), optionTitles[2]);
    });

    it("people can vote only once and are able to watch result", async () => {
        // we assume that auto mining on Ganache private blockchain is enabled that it automatically increases block height while a new transaction submitted
        votedOption1 = 0;
        await VotingInstance.vote(votedOption1, { from: testingAccountVoter1 });
        assert.equal(await VotingInstance.votesAmount(), 1);
        assert.equal(await web3.eth.getBlockNumber(), startWithBlockNumber + 2);

        await catchRevert(VotingInstance.vote(votedOption1, { from: testingAccountVoter1 })); // block height increases

        votedOption2 = 1;
        await VotingInstance.vote(votedOption2, { from: testingAccountVoter2 });
        assert.equal(await VotingInstance.votesAmount(), 2);
        assert.equal(await web3.eth.getBlockNumber(), startWithBlockNumber + 4);
        assert.equal(await VotingInstance.isExpired(), false);

        votedOption3 = 1;
        await VotingInstance.vote(votedOption3, { from: testingAccountVoter3 });
        assert.equal(await VotingInstance.votesAmount(), 3);
        assert.equal(await web3.eth.getBlockNumber(), startWithBlockNumber + 5);
        assert.equal(await VotingInstance.isExpired(), true);

        // we assume now the voting is expired
        assert.equal(await VotingInstance.getMyOption(testingAccountVoter3), votedOption3);

        votedOption4 = 0;
        await catchRevert(VotingInstance.vote(votedOption4, { from: testingAccountVoter4 }));

        assert.equal(await VotingInstance.getVotesByIndex(0), 1);
        assert.equal(await VotingInstance.getVotesByIndex(1), 2);
    });
});