/*
* Copyright 2018 PoC-Consortium
*/

import { Component, OnInit, ViewChild } from "@angular/core";
import { SelectedIndexChangedEventData, TabView, TabViewItem } from "tns-core-modules/ui/tab-view";
import { RouterExtensions } from "nativescript-angular/router";
import { SwipeGestureEventData } from "ui/gestures";
import { Image } from "ui/image"
import { TranslateService } from "ng2-translate";
import { Account, BurstAddress, Currency, constants } from "../../../lib/model";
import { AccountService, DatabaseService, MarketService, NotificationService, TabsService } from "../../../lib/services";
import { RadListViewComponent } from "nativescript-pro-ui/listview/angular";
import { isIOS } from "platform";
import { BarcodeScanner, ScanOptions } from 'nativescript-barcodescanner';

import * as SocialShare from "nativescript-social-share";

let clipboard = require("nativescript-clipboard");
let ZXing = require('nativescript-zxing');

@Component({
    selector: "balance",
    moduleId: module.id,
    templateUrl: "./balance.component.html",
    styleUrls: ["./balance.component.css"]
})
export class BalanceComponent implements OnInit {
    private account: Account;
    private address: string;
    private balance: string;
    private confirmed: boolean;
    private loading: boolean;
    private qrcode: Image;
    private zx: any;

    @ViewChild('radListView') radListView: RadListViewComponent;

    constructor(
        private accountService: AccountService,
        private barcodeScanner: BarcodeScanner,
        private databaseService: DatabaseService,
        public marketService: MarketService,
        private notificationService: NotificationService,
        private router: RouterExtensions,
        private tabsService: TabsService,
        private translateService: TranslateService
    ) { }

    ngOnInit(): void {
        this.zx = new ZXing();
        this.confirmed = true;
        this.loading = true;
        this.accountService.currentAccount.subscribe((account: Account) => {
            if (account != undefined) {
                // update information
                this.update(account);
                // reset
                this.loading = false;
                if (isIOS) {
                    this.radListView.listView.notifyPullToRefreshFinished(); // workaround https://github.com/NativeScript/nativescript-angular/issues/872
                }
            }
        });
    }

    public update(account: Account) {
        this.account = account;
        // generate qr code image
        this.qrcode = this.zx.createBarcode({ encode: account.address, height: 400, width: 400, format: ZXing.QR_CODE });
        this.address = account.address;
        this.balance = this.marketService.formatBurstcoin(account.balance);
        this.confirmed = account.balance == account.unconfirmedBalance;
    }

    public onDoubleTapBalance() {
        clipboard.setText(this.account.address);
        this.translateService.get('NOTIFICATIONS.COPIED', { value: this.account.address }).subscribe((res: string) => {
            this.notificationService.info(res);
        });
    }

    public onLongPressBalance() {
        SocialShare.shareText(this.account.address);
    }

    public onSwipeBalance(args: SwipeGestureEventData) {
        if (args.direction == 2) {
            this.tabsService.changeTab(1);
        }
    }

    public onTapCamera() {
        let options: ScanOptions = {
            formats: "QR_CODE"
        }
        this.barcodeScanner.scan(options).then((result) => {
            if (BurstAddress.isValid(result.text)) {
                this.router.navigate(['/send', result.text]);
            } else {
                this.translateService.get('NOTIFICATIONS.ERRORS.QR_CODE').subscribe((res: string) => {
                    this.notificationService.info(res);
                });
            }
        }, (errorMessage) => {
            this.translateService.get('NOTIFICATIONS.ERRORS.QR_CODE').subscribe((res: string) => {
                this.notificationService.info(res);
            });
        });
    }

    public refresh(args) {
        let listView = args.object;
        let account = this.accountService.currentAccount.value;
        this.accountService.synchronizeAccount(account)
            .then(account => {
                this.balance = this.marketService.formatBurstcoin(account.balance);
                this.accountService.setCurrentAccount(account);
                this.marketService.updateCurrency()
                    .then(currency => {
                        listView.notifyPullToRefreshFinished();
                    })
                    .catch(error => {
                        this.translateService.get(error.message).subscribe((res: string) => {
                            this.notificationService.info(res);
                        });
                        listView.notifyPullToRefreshFinished();
                    });
            })
            .catch(error => {
                this.marketService.updateCurrency()
                    .then(currency => {
                        listView.notifyPullToRefreshFinished();
                    })
                    .catch(error => {
                        this.translateService.get(error.message).subscribe((res: string) => {
                            this.notificationService.info(res);
                        });
                        listView.notifyPullToRefreshFinished();
                    });
                this.translateService.get(error.message).subscribe((res: string) => {
                    this.notificationService.info(res);
                });
                listView.notifyPullToRefreshFinished();
            })
    }

}
