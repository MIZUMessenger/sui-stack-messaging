// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

import { getContainerRuntimeClient } from 'testcontainers';

/**
 * Executes a command inside a Docker container.
 *
 * @param command - The command to execute as an array of strings.
 * @param containerId - The ID of the container to execute in.
 * @returns The output of the command execution.
 * @throws Error if the command exits with a non-zero code.
 */
export async function execCommand(command: string[], containerId: string): Promise<string> {
	const client = await getContainerRuntimeClient();
	const container = client.container.getById(containerId);
	const result = await client.container.exec(container, command);

	if (result.exitCode !== 0) {
		console.error(result.stderr);
		throw new Error(`Command "${command.join(' ')}" failed with exit code ${result.exitCode}`);
	}

	return result.output;
}

/**
 * Creates an exec function bound to a specific container.
 * Useful for passing to utilities that expect a simple exec function.
 */
export function createExecForContainer(containerId: string) {
	return (command: string) => execCommand(command.split(' '), containerId);
}
