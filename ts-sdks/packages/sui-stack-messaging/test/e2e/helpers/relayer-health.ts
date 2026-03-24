// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

export async function isRelayerReachable(relayerUrl: string): Promise<boolean> {
	try {
		const response = await fetch(`${relayerUrl}/health_check`, {
			signal: AbortSignal.timeout(3000),
		});
		return response.ok;
	} catch {
		return false;
	}
}
