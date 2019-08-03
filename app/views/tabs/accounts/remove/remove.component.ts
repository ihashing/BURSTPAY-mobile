/*
* Copyright 2018 PoC-Consortium
*/

import { Component, OnInit } from "@angular/core";
import { RouterExtensions } from "nativescript-angular/router";
import { ModalDialogParams } from "nativescript-angular/modal-dialog";
import { Page } from "ui/page";
import { TranslateService } from 'ng2-translate';

import { Account } from "../../../../lib/model";
import { AccountService, DatabaseService, NotificationService } from "../../../../lib/services";

@Component({
    selector: "remove",
    moduleId: module.id,
    templateUrl: "./remove.component.html",
    styleUrls: ["./remove.component.css"]
})
export class RemoveComponent implements OnInit {

    private loading: boolean;
    private remove: Account;

    constructor(
        private accountService: AccountService,
        private databaseService: DatabaseService,
        private params: ModalDialogParams,
        private notificationService: NotificationService,
        private page: Page,
        private router: RouterExtensions,
        private translateService: TranslateService
    ) {}

    public ngOnInit() {
        this.remove = this.params.context;
    }

    public onTapNo() {
        this.params.closeCallback(false);
    }

    public onTapOk() {
        this.loading = true;
        this.accountService.removeAccount(this.remove)
            .then(success => {
                this.params.closeCallback(success);
            })
            .catch(error => {
                this.translateService.get("NOTIFICATIONS.ERRORS.REMOVE").subscribe((res: string) => {
                    this.notificationService.info(res);
                });
                this.params.closeCallback(false);
            })
    }
}
