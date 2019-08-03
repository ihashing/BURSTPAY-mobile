/*
* Copyright 2018 PoC-Consortium
*/

import { NgModule } from "@angular/core";
import { Routes } from "@angular/router";
import { NativeScriptRouterModule } from "nativescript-angular/router";

import { ImportComponent } from "./import.component";

export const routes: Routes = [
    {
        path: "",
        component: ImportComponent
    }
];

@NgModule({
  imports: [NativeScriptRouterModule.forChild(routes)],
  exports: [NativeScriptRouterModule]
})
export class ImportRoutingModule { }
