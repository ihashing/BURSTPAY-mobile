/*
* Copyright 2018 PoC-Consortium
*/

import { Component, OnInit, ViewChild } from "@angular/core";
import { RouterExtensions } from "nativescript-angular/router";
import { TranslateService } from 'ng2-translate';

import { Account, BurstAddress } from "../../../lib/model";
import { CryptoService, NotificationService, AccountService } from "../../../lib/services";
import { ActivateService } from "../activate.service"

@Component({
    selector: "password",
    moduleId: module.id,
    templateUrl: "./password.component.html",
    styleUrls: ["./password.component.css"]
})
export class PasswordComponent implements OnInit {

    private pin: string;
    private passphrase: string;
    private address: any;

    constructor(
        private accountService: AccountService,
        private activateService: ActivateService,
        private cryptoService: CryptoService,
        private notificationService: NotificationService,
        private router: RouterExtensions,
        private translateService: TranslateService
    ) {}

    ngOnInit(): void {
        this.address = { value: this.accountService.currentAccount.value.address }
    }

    public onTapNext() {
        if (this.passphrase.length > 0) {
            this.cryptoService.generateMasterKeys(this.passphrase)
                .then(keypair => {
                    this.cryptoService.getAccountIdFromPublicKey(keypair.publicKey)
                        .then(id => {
                            this.cryptoService.getBurstAddressFromAccountId(id)
                                .then(address => {
                                    if (this.accountService.currentAccount.value.address == address) {
                                        this.activateService.setPassphrase(this.passphrase);
                                        this.router.navigate(['activate', 'pin']);
                                    } else {
                                        this.translateService.get("NOTIFICATIONS.WRONG_PASSPHRASE").subscribe((res: string) => {
                                            this.notificationService.info(res);
                                        });
                                    }
                                })
                                .catch(error => {

                                    this.translateService.get("NOTIFICATIONS.ERRORS.ADDRESS").subscribe((res: string) => {
                                        this.notificationService.info(res);
                                    });
                                })
                        })
                        .catch(error => {

                            this.translateService.get("NOTIFICATIONS.ERRORS.ACCOUNT_ID").subscribe((res: string) => {
                                this.notificationService.info(res);
                            });
                        })
                })
                .catch(error => {

                    this.translateService.get("NOTIFICATIONS.ERRORS.KEYPAIR").subscribe((res: string) => {
                        this.notificationService.info(res);
                    });
                })
        } else {
            this.translateService.get("NOTIFICATIONS.ENTER_SOMETHING").subscribe((res: string) => {
                this.notificationService.info(res);
            });
        }
    }
}
