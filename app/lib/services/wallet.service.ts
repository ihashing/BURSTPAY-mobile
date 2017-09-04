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

    private static readonly salt = "pxepHeytDgkPAHgwxRJ3EPW4";

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

    public createActiveWallet(passphrase: string, pin: string = ""): Promise<Wallet> {
        return new Promise((resolve, reject) => {
            let wallet: Wallet = new Wallet();
            // import active wallet
            wallet.type = "active";
            return this.cryptoService.generateMasterPublicAndPrivateKey(passphrase)
                .then(keypair => {
                    wallet.keypair.publicKey = keypair.publicKey;
                    return this.cryptoService.encryptAES(keypair.privateKey, this.hashPin(pin))
                        .then(encryptedKey => {
                            wallet.keypair.privateKey = encryptedKey;
                            wallet.pinHash = this.hashPin(pin);
                            return this.cryptoService.getAccountIdFromPublicKey(keypair.publicKey)
                                .then(id => {
                                    wallet.id = id;
                                    return this.cryptoService.getBurstAddressFromAccountId(id)
                                        .then(address => {
                                            wallet.address = address;
                                            return this.databaseService.saveWallet(wallet)
                                                .then(wallet => {
                                                    resolve(wallet);
                                                });
                                        });
                                });
                        });
                });
        });
    }

    public createOfflineWallet(address: string): Promise<Wallet> {
        return new Promise((resolve, reject) => {
            let wallet: Wallet = new Wallet();
            this.databaseService.findWallet(BurstAddress.decode(address))
                .then(found => {
                    if (found == undefined) {
                        // import offline wallet
                        wallet.type = "offline";
                        wallet.address = address;
                        return this.cryptoService.getAccountIdFromBurstAddress(address)
                            .then(id => {
                                wallet.id = id;
                                return this.databaseService.saveWallet(wallet)
                                    .then(wallet => {
                                        this.notificationService.info(JSON.stringify(wallet));
                                        resolve(wallet);
                                    });
                            });
                    } else {
                        reject("Burstcoin address already imported!");
                    }
                })
        });
    }

    public activateWallet(wallet: Wallet, passphrase: string, pin: string): Promise<Wallet> {
        return new Promise((resolve, reject) => {
            this.cryptoService.generateMasterPublicAndPrivateKey(passphrase)
                .then(keys => {
                    wallet.keypair.publicKey = keys.publicKey;
                    this.cryptoService.encryptAES(keys.privateKey, this.hashPin(pin))
                        .then(encryptedKey => {
                            wallet.keypair.privateKey = encryptedKey;
                            wallet.pinHash = this.hashPin(pin);
                            wallet.type = "active";
                            return this.databaseService.saveWallet(wallet)
                                .then(wallet => {
                                    this.notificationService.info(JSON.stringify(wallet));
                                    resolve(wallet);
                                });
                        })
                })
        });
    }

    public synchronizeWallet(wallet: Wallet): Promise<Wallet> {
        return new Promise((resolve, reject) => {
            this.getBalance(wallet.id)
                .then(balance => {
                    wallet.balance = balance;
                    this.getTransactions(wallet.id)
                        .then(transactions => {
                            wallet.transactions = transactions;
                            this.databaseService.saveWallet(wallet)
                                .catch(error => {
                                    console.log("failed save of wallet");
                                })
                            resolve(wallet);
                        }).catch(error => resolve(wallet));
                }).catch(error => resolve(wallet));
        });
    }

    public selectWallet(wallet: Wallet): Promise<Wallet> {
        return new Promise((resolve, reject) => {
            this.databaseService.selectWallet(wallet)
                .then(wallet => {
                    this.setCurrentWallet(wallet);
                    resolve(wallet);
                })
        });
    }

    public getTransactions(id: string): Promise<Transaction[]> {
        return new Promise((resolve, reject) => {
            let params: URLSearchParams = new URLSearchParams();
            params.set("requestType", "getAccountTransactions");
            params.set("firstIndex", "0");
            params.set("lastIndex", "15");
            params.set("account", id);
            let requestOptions = this.getRequestOptions();
            requestOptions.params = params;
            return this.http.get(WalletService.walletURL, requestOptions).toPromise()
                .then(response => {
                    let transactions: Transaction[] = [];
                    response.json().transactions.map(transaction => {
                        transaction.amountNQT = parseFloat(this.convertStringToNumber(transaction.amountNQT));
                        transaction.feeNQT = parseFloat(this.convertStringToNumber(transaction.feeNQT));
                        transactions.push(new Transaction(transaction));
                    });
                    resolve(transactions);
                })
                .catch(error => this.handleError(error));
        });
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
        return new Promise((resolve, reject) => {
            let params: URLSearchParams = new URLSearchParams();
            params.set("requestType", "getBalance");
            params.set("account", id);
            let requestOptions = this.getRequestOptions();
            requestOptions.params = params;
            return this.http.get(WalletService.walletURL, requestOptions).toPromise()
                .then(response => {
                    if (response.json().errorCode == undefined) {
                        let balanceString = response.json().guaranteedBalanceNQT;
                        balanceString = this.convertStringToNumber(balanceString);
                        resolve(parseFloat(balanceString));
                    } else {
                        reject(0);
                    }
                })
                .catch(error => this.handleError(error));
        });
    }

    public doTransaction(transaction: Transaction, encryptedPrivateKey: string, pin: string): Promise<Transaction> {
        return new Promise((resolve, reject) => {
            let unsignedTransactionHex, sendFields, broadcastFields, transactionFields;
            let params: URLSearchParams = new URLSearchParams();
            params.set("requestType", "sendMoney");
            params.set("recipient", transaction.recipientAddress);
            params.set("amountNQT", this.convertNumberToString(transaction.amountNQT));
            params.set("feeNQT", this.convertNumberToString(transaction.feeNQT));
            params.set("publicKey", transaction.senderPublicKey);
            params.set("deadline", "1440");
            let requestOptions = this.getRequestOptions();
            requestOptions.params = params;

            // request 'sendMoney' to burst node
            return this.http.post(WalletService.walletURL, {}, requestOptions).toPromise()
                .then(response => {
                    // get unsigned transactionbytes
                    unsignedTransactionHex = response.json().unsignedTransactionBytes || undefined;
                    // sign unsigned transaction bytes
                    return this.cryptoService.generateSignature(unsignedTransactionHex, encryptedPrivateKey, pin)
                        .then(signature => {
                            return this.cryptoService.verifySignature(signature, unsignedTransactionHex, transaction.senderPublicKey)
                                .then(verified => {
                                    if (verified) {
                                        return this.cryptoService.generateSignedTransactionBytes(unsignedTransactionHex, signature)
                                            .then(signedTransactionBytes => {
                                                params = new URLSearchParams();
                                                params.set("requestType", "broadcastTransaction");
                                                params.set("transactionBytes", signedTransactionBytes);
                                                requestOptions = this.getRequestOptions();
                                                requestOptions.params = params;
                                                // request 'broadcastTransaction' to burst node
                                                return this.http.post(WalletService.walletURL, {}, requestOptions).toPromise()
                                                    .then(response => {
                                                        params = new URLSearchParams();
                                                        params.set("requestType", "getTransaction");
                                                        params.set("transaction", response.json().transaction);
                                                        requestOptions = this.getRequestOptions();
                                                        requestOptions.params = params;
                                                        // request 'getTransaction' to burst node
                                                        return this.http.get(WalletService.walletURL, requestOptions).toPromise()
                                                            .then(response => {
                                                                resolve(new Transaction(response.json()));
                                                            })
                                                            .catch(error => reject(undefined));
                                                    })
                                                    .catch(error => reject(undefined));
                                            }).catch(error => reject(undefined));

                                    } else {
                                        reject(undefined);
                                    }
                                }).catch(error => reject(undefined));

                        }).catch(error => reject(undefined));
                }).catch(error => reject(undefined));
        });
    }

    public checkPin(pin: string): boolean {
        return this.currentWallet.value != undefined ? this.currentWallet.value.pinHash == this.hashPin(pin) : false;
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

    public convertNumberToString(n: number) {
        return parseFloat(n.toString()).toFixed(8).replace(".", "");
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
