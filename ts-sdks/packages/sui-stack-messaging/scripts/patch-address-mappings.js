#!/usr/bin/env node
// Copyright (c) Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

/**
 * Patches address_mapping.json to use MVR names for dependencies.
 *
 * The `sui move summary` command assigns placeholder addresses to dependencies.
 * This script replaces those addresses with MVR names, allowing the codegen
 * to generate type signatures that can be resolved at runtime via SuiClient's
 * MVR override system.
 *
 * Run this after `sui move summary` and before `sui-ts-codegen generate`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Maps Move package names to their MVR names
const DEPENDENCY_MVR_MAPPINGS = {
	sui_groups: '@local-pkg/sui-groups',
};

// Package summaries to patch (relative to this script)
const PACKAGE_SUMMARIES = [
	path.join(__dirname, '../../../../move/packages/sui_stack_messaging/package_summaries'),
];

function patchAddressMapping(summaryDir) {
	const mappingPath = path.join(summaryDir, 'address_mapping.json');

	if (!fs.existsSync(mappingPath)) {
		console.log(`Skipping ${summaryDir}: address_mapping.json not found`);
		return false;
	}

	const mappings = JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));
	let modified = false;

	for (const [pkgName, mvrName] of Object.entries(DEPENDENCY_MVR_MAPPINGS)) {
		if (mappings[pkgName] && mappings[pkgName] !== mvrName) {
			console.log(`  ${pkgName}: ${mappings[pkgName]} -> ${mvrName}`);
			mappings[pkgName] = mvrName;
			modified = true;
		}
	}

	if (modified) {
		fs.writeFileSync(mappingPath, JSON.stringify(mappings, null, 2) + '\n');
		return true;
	}

	return false;
}

function main() {
	console.log('Patching address mappings for MVR names...\n');

	let patched = 0;
	for (const summaryDir of PACKAGE_SUMMARIES) {
		if (patchAddressMapping(summaryDir)) {
			patched++;
		}
	}

	if (patched > 0) {
		console.log(`\nPatched ${patched} address mapping file(s).`);
	} else {
		console.log('\nNo changes needed.');
	}
}

main();
