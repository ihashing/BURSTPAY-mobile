import { Injectable, OnInit } from "@angular/core";
import { Http, Headers, RequestOptions, Response, URLSearchParams } from "@angular/http";
import { Router } from '@angular/router';
import { device } from "platform";
import { Observable, ReplaySubject } from 'rxjs/Rx';

import { BurstAddress, Currency, HttpError, Keypair, Transaction, Wallet } from "../model";
import { CryptoService, DatabaseService, NotificationService} from "./";

import { BehaviorSubject } from 'rxjs/BehaviorSubject';

import 'rxjs/add/operator/toPromise';


@Injectable()
export class WalletService {

    //private static readonly walletURL: string = "https://wallet.cryptoguru.org";
    //private static readonly walletPort: string = "8125"; // Testnet

    private static readonly walletURL: string = "http://176.9.47.157:6876/burst";
    private static readonly walletPort: string = "6876"; // Testnet

    public currentWallet: BehaviorSubject<any> = new BehaviorSubject(undefined);

    constructor(
        private http: Http = undefined,
        private cryptoService: CryptoService = undefined,
        private databaseService: DatabaseService = undefined,
        private notificationService: NotificationService = undefined
    ) {

    }

    public setCurrentWallet(wallet: Wallet) {
        this.currentWallet.next(wallet);
    }

    public createActiveWallet(input: string, pin: string = ""): Promise<Wallet> {
        return new Promise((resolve, reject) => {
            let wallet: Wallet = new Wallet();
            // import active wallet
            wallet.type = "active";
            wallet.selected = true;
            return this.cryptoService.generateMasterPublicAndPrivateKey(input)
                .then(keypair => {
                    return this.cryptoService.encryptAES(keypair.privateKey, this.hashPin(pin))
                        .then(encryptedKey => {
                            wallet.keypair.privateKey = encryptedKey;
                            console.log(encryptedKey);
                            wallet.pin = this.hashPin(pin);
                            return this.cryptoService.getAccountIdFromPublicKey(keypair.publicKey)
                                .then(id => {
                                    wallet.id = id;
                                    return this.cryptoService.getBurstAddressFromAccountId(id)
                                        .then(address => {
                                            wallet.address = address;
                                            console.log(address);
                                            // TODO: check if wallet exist with this address and overwrite keys
                                            return this.getBalance(wallet.id)
                                                .then(balance => {
                                                    wallet.balance = balance;
                                                    return this.databaseService.saveWallet(wallet).then(ac => {
                                                        this.notificationService.info(wallet.address);
                                                        this.setCurrentWallet(wallet);
                                                        resolve(wallet);
                                                    });
                                                })
                                                .catch(error => {
                                                    return this.databaseService.saveWallet(wallet).then(ac => {
                                                        this.notificationService.info(wallet.address);
                                                        this.setCurrentWallet(wallet);
                                                        resolve(wallet);
                                                    });
                                                });
                                        });
                                });
                        });
                });
        });
    }

    public createOfflineWallet(input: string) {
        return new Promise((resolve, reject) => {
            let wallet: Wallet = new Wallet();
            this.databaseService.findWallet(BurstAddress.decode(input))
                .then(found => {
                    if (found == undefined) {
                        // import offline wallet
                        wallet.type = "offline";
                        wallet.address = input;
                        wallet.selected = true;
                        return this.cryptoService.getAccountIdFromBurstAddress(input)
                            .then(id => {
                                wallet.id = id;
                                this.getBalance(wallet.id)
                                    .then(balance => {
                                        wallet.balance = balance;
                                        this.getTransactions(wallet.id)
                                            .then(transactions => {
                                                wallet.transactions = transactions;
                                                return this.databaseService.saveWallet(wallet).then(ac => {
                                                    this.notificationService.info(JSON.stringify(wallet));
                                                    this.setCurrentWallet(wallet);
                                                    resolve(wallet);
                                                });
                                            })
                                    })
                                    .catch(error => {
                                        return this.databaseService.saveWallet(wallet).then(ac => {
                                            this.notificationService.info(JSON.stringify(wallet));
                                            this.setCurrentWallet(wallet);
                                            resolve(wallet);
                                        });
                                    });
                            });
                    } else {
                        reject("Burstcoin address already imported!");
                    }
                })
        });
    }

    public getTransactions(id: string): Promise<Transaction[]> {
        let params: URLSearchParams = new URLSearchParams();
        params.set("requestType", "getAccountTransactions");
        params.set("firstIndex", "0");
        params.set("lastIndex", "15");
        params.set("account", id);
        let requestOptions = this.getRequestOptions();
        requestOptions.params = params;
        return this.http.get(WalletService.walletURL, requestOptions).toPromise()
            .then(response => {
                console.log(JSON.stringify(response.json()));
                let transactions: Transaction[] = [];
                response.json().transactions.map(transaction => {
                    console.log(transaction);
                    transaction.amountNQT = parseFloat(this.convertStringToNumber(transaction.amountNQT));
                    transaction.feeNQT = parseFloat(this.convertStringToNumber(transaction.feeNQT));
                    transactions.push(new Transaction(transaction));
                });
                return transactions || [];
            })
            .catch(error => this.handleError(error));
    }

    public getTransaction(id: string): Promise<Transaction> {
        let params: URLSearchParams = new URLSearchParams();
        params.set("requestType", "getTransaction");
        params.set("transaction", id);
        let requestOptions = this.getRequestOptions();
        requestOptions.params = params;
        return this.http.get(WalletService.walletURL, requestOptions).toPromise()
            .then(response => {
                return response.json() || [];
            })
            .catch(error => this.handleError(error));
    }

    public getBalance(id: string): Promise<number> {
        let params: URLSearchParams = new URLSearchParams();
        params.set("requestType", "getBalance");
        params.set("account", id);
        let requestOptions = this.getRequestOptions();
        requestOptions.params = params;
        return this.http.get(WalletService.walletURL, requestOptions).toPromise()
            .then(response => {
                let balanceString = response.json().guaranteedBalanceNQT;
                balanceString = this.convertStringToNumber(balanceString);
                return parseFloat(balanceString);
            })
            .catch(error => this.handleError(error));
    }

    public doTransaction(transaction: Transaction): Promise<Transaction> {
        let unsignedTransactionBytes, sendFields, broadcastFields, transactionFields;
        // TODO: maybe all on client signing??? WTF
        sendFields = {
            "Content-Type": "application/json",
            "type": "sendMoney",
            "amountNQT": transaction.amountNQT,
            "feeNQT": transaction.feeNQT,
            "publicKey": transaction.senderPublicKey,
        };
        // request 'sendMoney' to burst node
        return this.http.get(WalletService.walletURL + ":" + WalletService.walletPort, this.getRequestOptions(sendFields)).toPromise()
            .then(response => {
                // get unsigned transactionbytes
                unsignedTransactionBytes = response.json().unsignedTransactionBytes || undefined;
                // sign unsigned transaction bytes
                return this.cryptoService.signTransactionBytes(unsignedTransactionBytes)
                    .then(signedTransactionBytes => {
                        broadcastFields = {
                            "Content-Type": "application/json",
                            "type": "broadcastTransaction",
                            "transactionBytes": signedTransactionBytes
                        };
                        // request 'broadcastTransaction' to burst node
                        return this.http.get(WalletService.walletURL + ":" + WalletService.walletPort, this.getRequestOptions(broadcastFields)).toPromise()
                            .then(response => {
                                transactionFields = {
                                    "Content-Type": "application/json",
                                    "type": "getTransaction",
                                    "transaction": response.json().transaction
                                }
                                // request 'getTransaction' to burst node
                                return this.http.get(WalletService.walletURL + ":" + WalletService.walletPort, this.getRequestOptions(transactionFields)).toPromise()
                                    .then(response => {
                                        return new Transaction(response.json());
                                    })
                                    .catch(error => this.handleError(error));
                            })
                            .catch(error => this.handleError(error));
                    });
            })
            .catch(error => this.handleError(error));
    }

    public checkPin(pin: string): boolean {
        return this.currentWallet != undefined ? this.currentWallet.value.pin == this.hashPin(pin) : false;
    }

    public hashPin(pin: string): string {
        return this.cryptoService.hashSHA256(pin + device.uuid);
    }

    public isBurstcoinAddress(address: string): boolean {
        return /^BURST\-[A-Z0-9]{4}\-[A-Z0-9]{4}\-[A-Z0-9]{4}\-[A-Z0-9]{5}/i.test(address);
    }

    public isPin(pin: string): boolean {
        return /^[0-9]{6}/i.test(pin);
    }

    public convertStringToNumber(str, value = ".", position = 8) {
        return str.substring(0, str.length - position) + value + str.substring(str.length - position);
    }

    public getRequestOptions(fields = {}) {
        let headers = new Headers(fields);
        let options = new RequestOptions({ headers: headers });
        return options;
    }

    private handleError(error: Response | any) {
        console.log(error);
        return Promise.reject(new HttpError(error));
    }
}