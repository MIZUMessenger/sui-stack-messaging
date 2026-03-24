// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { requestSuiFromFaucetV2 } from '@mysten/sui/faucet';
import { Transaction } from '@mysten/sui/transactions';
import type { ClientWithCoreApi } from '@mysten/sui/client';
import type { Keypair } from '@mysten/sui/cryptography';
import type { Account } from './types.js';
import { getNewAccount } from './get-new-account.js';

/** Amount to send to each test account (0.5 SUI) */
const FUNDING_AMOUNT = 300_000_000n;

export type AccountFunding = { faucetUrl: string } | { client: ClientWithCoreApi; signer: Keypair };

/**
 * Creates and funds a new account.
 *
 * - Pass `{ faucetUrl }` to fund via the faucet (localnet / integration tests).
 * - Pass `{ client, signer }` to fund via SUI transfer from the admin wallet (testnet e2e).
 */
export async function createFundedAccount(funding: AccountFunding): Promise<Account> {
	const account = getNewAccount();

	if ('faucetUrl' in funding) {
		await requestSuiFromFaucetV2({
			host: funding.faucetUrl,
			recipient: account.address,
		});
	} else {
		const tx = new Transaction();
		const [coin] = tx.splitCoins(tx.gas, [FUNDING_AMOUNT]);
		tx.transferObjects([coin], account.address);

		const result = await funding.signer.signAndExecuteTransaction({
			transaction: tx,
			client: funding.client,
		});
		await funding.client.core.waitForTransaction({ result });
	}

	return account;
}
