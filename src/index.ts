declare function require(name:string): any;
const execSync = typeof window !== "undefined" || require("child_process").execSync;

import mongoose from 'mongoose'
import { UTXO } from './types'

type CardanoCliConstructorOptions = {
    network: 'testnet' | 'mainnet',
    magic?: number,
    era: 'alonzo-era' | 'shelly-era',
    txBasePath?: string,
    keyBasePath?: string
}

type TransactionSubmitResponse = { status: boolean, hash: string, error: null | string }

export class CardanoCLI {
    network: 'mainnet' | 'testnet'
    magic?: number
    base: string = 'cardano-cli'
    era: 'alonzo-era' | 'shelly-era'
    txBasePath?: string = './bin'
    keyBasePath?: string = './keys'

    constructor(options: CardanoCliConstructorOptions) {
        this.network = options.network
        this.magic = options.magic
        this.era = options.era
        this.txBasePath = options.txBasePath
        this.keyBasePath = options.keyBasePath
    }

    isTestnet(): boolean {
        return this.network === 'testnet'
    }

    getUTXOs(address: string): UTXO[] {
        if(!address) return []

        let command = [
            this.base,
            'query utxo',
            `--address ${address}`,
            this.isTestnet() ? `--testnet-magic=${this.magic}` : '--mainnet'
        ].join(' ')

        const results = execSync(command, {stdio : 'pipe' }).toString().split('\n')

        const response: UTXO[] = []

        for(let i=2;i<results.length-1;i++) {
            const splits = results[i].replace(/\s+/g, " ").split(' ')
            response.push({
                txHash: splits[0],
                txId: splits[1],
                lovelace: +splits[2]
            })
        }
        
        return response
    }

    getTotalBalance(address: string): number {
        const utxos: UTXO[] = this.getUTXOs(address)
        return utxos.reduce((prev, curr) => {
            return prev + curr.lovelace!!
        }, 0)
    }

    buildTransaction(senderAddress: string, UTXOs: UTXO[], receiverAddress: string, lovelace: number): any  {
        if(UTXOs.length === 0) return { error: 'At least one UTXO is required.' }
        
        const fileId = new mongoose.Types.ObjectId().toString()
         
        let command = [
            this.base,
            'transaction build',
            `--${this.era}`,
            this.isTestnet() ? `--testnet-magic=${this.magic}` : '--mainnet',
            `--change-address ${senderAddress}`,
            ...UTXOs.map(x => `--tx-in ${x.txHash}#${x.txId}`),
            `--tx-out '${receiverAddress} ${lovelace} lovelace'`,
            `--out-file ${this.txBasePath}/unsigned_${fileId}.tx`
        ].join(' ')

        try {
            const response = execSync(command, { stdio : 'pipe' }).toString()
            console.log(response)
        } catch(e: any) {
            return { error: e.message }
        }

        return { fileId }
    }

    signTransaction(unsignedFileId: string, sKeyFilePath: string): any {
        let command = [
            this.base,
            'transaction sign',
            this.isTestnet() ? `--testnet-magic=${this.magic}` : '--mainnet',
            `--tx-body-file ${this.txBasePath}/unsigned_${unsignedFileId}.tx`,
            `--signing-key-file ${this.keyBasePath}/${sKeyFilePath}`,
            `--out-file ${this.txBasePath}/signed_${unsignedFileId}.tx`
        ].join(' ')

        try {
            execSync(command, { stdio : 'pipe' }).toString()
        } catch(e: any) {
            return { error: e.message }
        }

        return {
            singedFileId: unsignedFileId
        }
    } 

    submitTransaction(singedFileId: string): any {
        let command = [
            this.base,
            'transaction submit',
            this.isTestnet() ? `--testnet-magic=${this.magic}` : '--mainnet',
            `--tx-file ${this.txBasePath}/signed_${singedFileId}.tx`,
        ].join(' ')

        try {
            const response = execSync(command, { stdio : 'pipe' }).toString()
            console.log(response)
        } catch(e: any) {
            return { error: e.message }
        }

        return {}
    }
}