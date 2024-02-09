/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { localize } from 'vs/nls';
import { IBannerService } from 'vs/workbench/services/banner/browser/bannerService';
import { IOpenerService } from 'vs/platform/opener/common/opener';
import { IHostService } from 'vs/workbench/services/host/browser/host';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { IProductService } from 'vs/platform/product/common/productService';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { Codicon } from 'vs/base/common/codicons';
import Severity from 'vs/base/common/severity';


const REMOTE_UNSUPPORTED_CONNECTION_CHOICE_KEY = 'remote.unsupportedConnectionChoice';

export class InitialRemoteConnectionHealthContribution implements IWorkbenchContribution {

	constructor(
		@IRemoteAgentService private readonly _remoteAgentService: IRemoteAgentService,
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
		@IBannerService private readonly bannerService: IBannerService,
		@IDialogService private readonly dialogService: IDialogService,
		@IOpenerService private readonly openerService: IOpenerService,
		@IHostService private readonly hostService: IHostService,
		@IStorageService private readonly storageService: IStorageService,
		@IProductService private readonly productService: IProductService,
	) {
		if (this._environmentService.remoteAuthority) {
			this._checkInitialRemoteConnectionHealth();
		}
	}

	private async _confirmConnection(): Promise<boolean> {
		const enum ConnectionChoice {
			Allow = 1,
			LearnMore = 2,
			Cancel = 0
		}

		const { result, checkboxChecked } = await this.dialogService.prompt<ConnectionChoice>({
			type: Severity.Warning,
			message: localize('unsupportedGlibcWarning', "You are about to connect to an OS version that is unsupported by {0}.", this.productService.nameLong),
			buttons: [
				{
					label: localize({ key: 'allow', comment: ['&& denotes a mnemonic'] }, "&&Allow"),
					run: () => ConnectionChoice.Allow
				},
				{
					label: localize({ key: 'learnMore', comment: ['&& denotes a mnemonic'] }, "&&Learn More"),
					run: async () => { await this.openerService.open('https://aka.ms/vscode-remote/faq/old-linux'); return ConnectionChoice.LearnMore; }
				}
			],
			cancelButton: {
				run: () => ConnectionChoice.Cancel
			},
			checkbox: {
				label: localize('remember', "Do not show again"),
			}
		});

		if (result === ConnectionChoice.LearnMore) {
			return await this._confirmConnection();
		}

		const allowed = result === ConnectionChoice.Allow;
		if (allowed && checkboxChecked) {
			this.storageService.store(`${REMOTE_UNSUPPORTED_CONNECTION_CHOICE_KEY}.${this._environmentService.remoteAuthority}`, allowed, StorageScope.PROFILE, StorageTarget.MACHINE);
		}

		return allowed;
	}

	private async _checkInitialRemoteConnectionHealth(): Promise<void> {
		try {
			const environment = await this._remoteAgentService.getRawEnvironment();

			if (environment && environment.isUnsupportedGlibc) {
				let allowed = this.storageService.getBoolean(`${REMOTE_UNSUPPORTED_CONNECTION_CHOICE_KEY}.${this._environmentService.remoteAuthority}`, StorageScope.PROFILE);
				if (allowed === undefined) {
					allowed = await this._confirmConnection();
				}
				if (allowed) {
					const actions = [
						{
							label: localize('unsupportedGlibcBannerLearnMore', "Learn More"),
							href: 'https://aka.ms/vscode-remote/faq/old-linux'
						}
					];
					this.bannerService.show({
						id: 'unsupportedGlibcWarning.banner',
						message: localize('unsupportedGlibcWarning.banner', "You are connected to an OS version that is unsupported by {0}.", this.productService.nameLong),
						actions,
						icon: Codicon.warning,
						disableCloseAction: true
					});
				} else {
					this.hostService.openWindow({ forceReuseWindow: true, remoteAuthority: null });
					return;
				}
			}
		} catch (err) {
		}
	}
}
