import { Clarinet, Tx, Chain, Account, types } from 'https://deno.land/x/clarinet@v0.14.0/index.ts';
import { assertEquals } from 'https://deno.land/std@0.90.0/testing/asserts.ts';

Clarinet.test({
    name: "Ensure that campaign creation works correctly",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get('deployer')!;
        let wallet1 = accounts.get('wallet_1')!;
        
        let block = chain.mineBlock([
            Tx.contractCall('crowd_funding', 'create-campaign', [
                types.uint(1000000000), // 1000 STX goal
                types.uint(100) // deadline 100 blocks from now
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectOk(), types.uint(0));
        
        // Verify campaign details
        let campaignDetails = chain.callReadOnlyFn(
            'crowd_funding',
            'get-campaign-details',
            [types.uint(0)],
            deployer.address
        );
        
        let campaign = campaignDetails.result.expectSome().expectTuple();
        assertEquals(campaign.goal, types.uint(1000000000));
        assertEquals(campaign.raised, types.uint(0));
        assertEquals(campaign.claimed, types.bool(false));
    },
});

Clarinet.test({
    name: "Ensure that invalid campaign creation fails",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get('deployer')!;
        
        // Test zero goal
        let block = chain.mineBlock([
            Tx.contractCall('crowd_funding', 'create-campaign', [
                types.uint(0),
                types.uint(100)
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectErr(), types.uint(103)); // err-invalid-amount
        
        // Test past deadline
        block = chain.mineBlock([
            Tx.contractCall('crowd_funding', 'create-campaign', [
                types.uint(1000000000),
                types.uint(0) // deadline in the past
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts.length, 1);
        assertEquals(block.receipts[0].result.expectErr(), types.uint(104)); // err-deadline-passed
    },
});

Clarinet.test({
    name: "Ensure that contributions work correctly",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get('deployer')!;
        let wallet1 = accounts.get('wallet_1')!;
        let wallet2 = accounts.get('wallet_2')!;
        
        // Create campaign
        let block = chain.mineBlock([
            Tx.contractCall('crowd_funding', 'create-campaign', [
                types.uint(1000000000), // 1000 STX goal
                types.uint(1000) // deadline far in future
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts[0].result.expectOk(), types.uint(0));
        
        // Make contributions
        block = chain.mineBlock([
            Tx.contractCall('crowd_funding', 'contribute', [
                types.uint(0),
                types.uint(100000000) // 100 STX
            ], wallet1.address),
            Tx.contractCall('crowd_funding', 'contribute', [
                types.uint(0),
                types.uint(200000000) // 200 STX
            ], wallet2.address)
        ]);
        
        assertEquals(block.receipts.length, 2);
        assertEquals(block.receipts[0].result.expectOk(), types.bool(true));
        assertEquals(block.receipts[1].result.expectOk(), types.bool(true));
        
        // Verify campaign raised amount
        let campaignDetails = chain.callReadOnlyFn(
            'crowd_funding',
            'get-campaign-details',
            [types.uint(0)],
            deployer.address
        );
        
        let campaign = campaignDetails.result.expectSome().expectTuple();
        assertEquals(campaign.raised, types.uint(300000000)); // 300 STX total
        
        // Verify individual contributions
        let contribution1 = chain.callReadOnlyFn(
            'crowd_funding',
            'get-contribution',
            [types.uint(0), types.principal(wallet1.address)],
            deployer.address
        );
        assertEquals(contribution1.result.expectSome().expectTuple().amount, types.uint(100000000));
    },
});

Clarinet.test({
    name: "Ensure that contributions to expired campaigns fail",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get('deployer')!;
        let wallet1 = accounts.get('wallet_1')!;
        
        // Create campaign with short deadline
        let block = chain.mineBlock([
            Tx.contractCall('crowd_funding', 'create-campaign', [
                types.uint(1000000000),
                types.uint(2) // deadline in 2 blocks
            ], deployer.address)
        ]);
        
        // Mine blocks to pass deadline
        chain.mineEmptyBlock();
        chain.mineEmptyBlock();
        chain.mineEmptyBlock();
        
        // Try to contribute after deadline
        block = chain.mineBlock([
            Tx.contractCall('crowd_funding', 'contribute', [
                types.uint(0),
                types.uint(100000000)
            ], wallet1.address)
        ]);
        
        assertEquals(block.receipts[0].result.expectErr(), types.uint(104)); // err-deadline-passed
    },
});

Clarinet.test({
    name: "Ensure that successful campaign funds can be claimed",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get('deployer')!;
        let wallet1 = accounts.get('wallet_1')!;
        
        // Create campaign
        let block = chain.mineBlock([
            Tx.contractCall('crowd_funding', 'create-campaign', [
                types.uint(1000000000), // 1000 STX goal
                types.uint(5) // deadline in 5 blocks
            ], deployer.address)
        ]);
        
        // Contribute to meet goal
        block = chain.mineBlock([
            Tx.contractCall('crowd_funding', 'contribute', [
                types.uint(0),
                types.uint(1000000000) // exactly meet goal
            ], wallet1.address)
        ]);
        
        // Mine blocks to pass deadline
        chain.mineEmptyBlockUntil(10);
        
        // Claim funds
        block = chain.mineBlock([
            Tx.contractCall('crowd_funding', 'claim-funds', [
                types.uint(0)
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts[0].result.expectOk(), types.bool(true));
        
        // Verify campaign is marked as claimed
        let campaignDetails = chain.callReadOnlyFn(
            'crowd_funding',
            'get-campaign-details',
            [types.uint(0)],
            deployer.address
        );
        
        let campaign = campaignDetails.result.expectSome().expectTuple();
        assertEquals(campaign.claimed, types.bool(true));
    },
});

Clarinet.test({
    name: "Ensure that unsuccessful campaign funds cannot be claimed",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get('deployer')!;
        let wallet1 = accounts.get('wallet_1')!;
        
        // Create campaign
        let block = chain.mineBlock([
            Tx.contractCall('crowd_funding', 'create-campaign', [
                types.uint(1000000000), // 1000 STX goal
                types.uint(5)
            ], deployer.address)
        ]);
        
        // Contribute less than goal
        block = chain.mineBlock([
            Tx.contractCall('crowd_funding', 'contribute', [
                types.uint(0),
                types.uint(500000000) // only 500 STX
            ], wallet1.address)
        ]);
        
        // Mine blocks to pass deadline
        chain.mineEmptyBlockUntil(10);
        
        // Try to claim funds
        block = chain.mineBlock([
            Tx.contractCall('crowd_funding', 'claim-funds', [
                types.uint(0)
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts[0].result.expectErr(), types.uint(105)); // err-goal-not-reached
    },
});

Clarinet.test({
    name: "Ensure that refunds work for unsuccessful campaigns",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get('deployer')!;
        let wallet1 = accounts.get('wallet_1')!;
        let wallet2 = accounts.get('wallet_2')!;
        
        // Create campaign
        let block = chain.mineBlock([
            Tx.contractCall('crowd_funding', 'create-campaign', [
                types.uint(1000000000), // 1000 STX goal
                types.uint(5)
            ], deployer.address)
        ]);
        
        // Make contributions that don't meet goal
        block = chain.mineBlock([
            Tx.contractCall('crowd_funding', 'contribute', [
                types.uint(0),
                types.uint(300000000) // 300 STX
            ], wallet1.address),
            Tx.contractCall('crowd_funding', 'contribute', [
                types.uint(0),
                types.uint(200000000) // 200 STX
            ], wallet2.address)
        ]);
        
        // Mine blocks to pass deadline
        chain.mineEmptyBlockUntil(10);
        
        // Request refunds
        block = chain.mineBlock([
            Tx.contractCall('crowd_funding', 'refund', [
                types.uint(0)
            ], wallet1.address),
            Tx.contractCall('crowd_funding', 'refund', [
                types.uint(0)
            ], wallet2.address)
        ]);
        
        assertEquals(block.receipts[0].result.expectOk(), types.bool(true));
        assertEquals(block.receipts[1].result.expectOk(), types.bool(true));
        
        // Verify contributions are deleted
        let contribution1 = chain.callReadOnlyFn(
            'crowd_funding',
            'get-contribution',
            [types.uint(0), types.principal(wallet1.address)],
            deployer.address
        );
        assertEquals(contribution1.result, types.none());
    },
});

Clarinet.test({
    name: "Ensure that milestone management works correctly",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get('deployer')!;
        let wallet1 = accounts.get('wallet_1')!;
        
        // Create campaign
        let block = chain.mineBlock([
            Tx.contractCall('crowd_funding', 'create-campaign', [
                types.uint(1000000000),
                types.uint(100)
            ], deployer.address)
        ]);
        
        // Add milestone
        block = chain.mineBlock([
            Tx.contractCall('crowd_funding', 'add-campaign-milestone', [
                types.uint(0),
                types.utf8("First Milestone"),
                types.utf8("Complete prototype development"),
                types.uint(250000000), // 250 STX target
                types.uint(50) // deadline
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts[0].result.expectOk(), types.bool(true));
        
        // Verify milestone details
        let milestoneDetails = chain.callReadOnlyFn(
            'crowd_funding',
            'get-milestone-details',
            [types.uint(0), types.uint(0)],
            deployer.address
        );
        
        let milestone = milestoneDetails.result.expectSome().expectTuple();
        assertEquals(milestone.title, types.utf8("First Milestone"));
        assertEquals(milestone['target-amount'], types.uint(250000000));
        assertEquals(milestone.completed, types.bool(false));
    },
});

Clarinet.test({
    name: "Ensure that campaign updates work correctly",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get('deployer')!;
        let wallet1 = accounts.get('wallet_1')!;
        
        // Create campaign
        let block = chain.mineBlock([
            Tx.contractCall('crowd_funding', 'create-campaign', [
                types.uint(1000000000),
                types.uint(100)
            ], deployer.address)
        ]);
        
        // Post update
        block = chain.mineBlock([
            Tx.contractCall('crowd_funding', 'post-campaign-update', [
                types.uint(0),
                types.utf8("Development Progress"),
                types.utf8("We have completed 50% of the planned features and are on track for our deadline.")
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts[0].result.expectOk(), types.bool(true));
        
        // Verify stats updated
        let campaignStats = chain.callReadOnlyFn(
            'crowd_funding',
            'get-campaign-statistics',
            [types.uint(0)],
            deployer.address
        );
        
        let stats = campaignStats.result.expectSome().expectTuple();
        assertEquals(stats['updates-count'], types.uint(1));
    },
});

Clarinet.test({
    name: "Ensure that only campaign owners can manage campaigns",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get('deployer')!;
        let wallet1 = accounts.get('wallet_1')!;
        
        // Create campaign
        let block = chain.mineBlock([
            Tx.contractCall('crowd_funding', 'create-campaign', [
                types.uint(1000000000),
                types.uint(100)
            ], deployer.address)
        ]);
        
        // Try to add milestone as non-owner
        block = chain.mineBlock([
            Tx.contractCall('crowd_funding', 'add-campaign-milestone', [
                types.uint(0),
                types.utf8("Unauthorized Milestone"),
                types.utf8("This should fail"),
                types.uint(250000000),
                types.uint(50)
            ], wallet1.address)
        ]);
        
        assertEquals(block.receipts[0].result.expectErr(), types.uint(100)); // err-owner-only
        
        // Try to post update as non-owner
        block = chain.mineBlock([
            Tx.contractCall('crowd_funding', 'post-campaign-update', [
                types.uint(0),
                types.utf8("Unauthorized Update"),
                types.utf8("This should also fail")
            ], wallet1.address)
        ]);
        
        assertEquals(block.receipts[0].result.expectErr(), types.uint(100)); // err-owner-only
    },
});

Clarinet.test({
    name: "Ensure that platform fee management works correctly",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get('deployer')!;
        let wallet1 = accounts.get('wallet_1')!;
        
        // Update platform fee as owner
        let block = chain.mineBlock([
            Tx.contractCall('crowd_funding', 'update-platform-fee', [
                types.uint(50) // 0.5%
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts[0].result.expectOk(), types.bool(true));
        
        // Try to update as non-owner
        block = chain.mineBlock([
            Tx.contractCall('crowd_funding', 'update-platform-fee', [
                types.uint(100)
            ], wallet1.address)
        ]);
        
        assertEquals(block.receipts[0].result.expectErr(), types.uint(100)); // err-owner-only
        
        // Try to set invalid fee (over 10%)
        block = chain.mineBlock([
            Tx.contractCall('crowd_funding', 'update-platform-fee', [
                types.uint(1100) // 11%
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts[0].result.expectErr(), types.uint(103)); // err-invalid-amount
    },
});

Clarinet.test({
    name: "Ensure that campaign progress and time calculations work correctly",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get('deployer')!;
        let wallet1 = accounts.get('wallet_1')!;
        
        // Create campaign
        let block = chain.mineBlock([
            Tx.contractCall('crowd_funding', 'create-campaign', [
                types.uint(1000000000), // 1000 STX goal
                types.uint(100)
            ], deployer.address)
        ]);
        
        // Contribute 30% of goal
        block = chain.mineBlock([
            Tx.contractCall('crowd_funding', 'contribute', [
                types.uint(0),
                types.uint(300000000) // 300 STX
            ], wallet1.address)
        ]);
        
        // Check campaign progress
        let progress = chain.callReadOnlyFn(
            'crowd_funding',
            'get-campaign-progress',
            [types.uint(0)],
            deployer.address
        );
        
        assertEquals(progress.result.expectOk(), types.uint(30)); // 30% progress
        
        // Check if campaign is successful (should be false)
        let isSuccessful = chain.callReadOnlyFn(
            'crowd_funding',
            'is-campaign-successful',
            [types.uint(0)],
            deployer.address
        );
        
        assertEquals(isSuccessful.result, types.bool(false));
        
        // Check total campaigns count
        let totalCampaigns = chain.callReadOnlyFn(
            'crowd_funding',
            'get-total-campaigns',
            [],
            deployer.address
        );
        
        assertEquals(totalCampaigns.result, types.uint(1));
    },
});

Clarinet.test({
    name: "Ensure that minimum contribution updates work correctly",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get('deployer')!;
        let wallet1 = accounts.get('wallet_1')!;
        
        // Update minimum contribution
        let block = chain.mineBlock([
            Tx.contractCall('crowd_funding', 'update-minimum-contribution', [
                types.uint(5000000) // 5 STX minimum
            ], deployer.address)
        ]);
        
        assertEquals(block.receipts[0].result.expectOk(), types.bool(true));
        
        // Try to update as non-owner
        block = chain.mineBlock([
            Tx.contractCall('crowd_funding', 'update-minimum-contribution', [
                types.uint(10000000)
            ], wallet1.address)
        ]);
        
        assertEquals(block.receipts[0].result.expectErr(), types.uint(100)); // err-owner-only
    },
});

Clarinet.test({
    name: "Ensure that platform fee calculation works correctly",
    async fn(chain: Chain, accounts: Map<string, Account>) {
        let deployer = accounts.get('deployer')!;
        
        // Test fee calculation
        let feeCalculation = chain.callReadOnlyFn(
            'crowd_funding',
            'calculate-platform-fee',
            [types.uint(1000000000)], // 1000 STX
            deployer.address
        );
        
        assertEquals(feeCalculation.result, types.uint(250000)); // 0.25% of 1000 STX = 2.5 STX
    },
});