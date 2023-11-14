import { atom } from 'jotai'
import { Devnet, DevnetAccount, devnets } from '../utils/network'

const devnetAtom = atom<Devnet>(devnets[0])

const envAtom = atom<string>('remoteDevnet')

const isDevnetAliveAtom = atom<boolean>(true)

const selectedDevnetAccountAtom = atom<null | DevnetAccount>(null)

const availableDevnetAccountsAtom = atom<DevnetAccount[]>([])

export {
    devnetAtom,
    envAtom,
    isDevnetAliveAtom,
    selectedDevnetAccountAtom,
    availableDevnetAccountsAtom
}
