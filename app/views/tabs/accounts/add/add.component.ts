/*
* Copyright 2018 PoC-Consortium
*/

import { Component, OnInit } from "@angular/core";
import { RouterExtensions } from "nativescript-angular/router";
import { ModalDialogParams } from "nativescript-angular/modal-dialog";
import { Page } from "ui/page";
import { topmost } from "ui/frame";

@Component({
    selector: "add",
    moduleId: module.id,
    templateUrl: "./add.component.html",
    styleUrls: ["./add.component.css"]
})
export class AddComponent implements OnInit {

    constructor(
        private params: ModalDialogParams,
        private page: Page,
        private router: RouterExtensions
    ) {}

    public ngOnInit() {
        this.page.on("unloaded", () => {
            // using the unloaded event to close the modal when there is user interaction
            // e.g. user taps outside the modal page
            this.params.closeCallback();
        });
    }

    public onTapImport() {
        this.params.closeCallback('import');
        //this.router.navigate(['import'], { clearHistory: true });
    }

    public onTapCreate() {
        this.params.closeCallback('create');
        //this.router.navigate(['create'], { clearHistory: true });
    }

    public onTapNo() {
        this.params.closeCallback();
    }
}
