import React, { useEffect, useState } from 'react'

import CompiledContracts from '../../components/CompiledContracts'
import './styles.css'
import Container from '../../ui_components/Container'

import { type AccordianTabs } from '../Plugin'
import * as zksync from 'zksync-web3'
import ConstructorInput from '../../components/ConstructorInput'
import { type DeployedContract } from '../../types/contracts'
import { type Transaction } from '../../types/transaction'
import { Contract } from 'ethers'
import { useAtom } from 'jotai/react/useAtom'
import { transactionsAtom } from '../../atoms/transaction'
import useRemixClient from '../../hooks/useRemixClient'
import { contractsAtom, selectedContractAtom } from '../../atoms/compiledContracts'
import { useAtomValue } from 'jotai/react/useAtomValue'
import { accountAtom } from '../../atoms/connection'
import { deployedContractsAtom, deployedSelectedContractAtom } from '../../atoms/deployedContracts'

interface DeploymentProps {
  setActiveTab: (tab: AccordianTabs) => void
}

const Deployment: React.FC<DeploymentProps> = ({ setActiveTab }) => {
  const { remixClient } = useRemixClient()
  const [ transactions, setTransactions ] = useAtom(transactionsAtom)

  const [contracts, setContracts] = useAtom(contractsAtom)
  const [selectedContract, setSelectedContract] = useAtom(selectedContractAtom)

  const account = useAtomValue(accountAtom)

  const [deployedContracts, deployedSetContracts] = useAtom(deployedContractsAtom)
  const [deployedSelectedContract, deployedSetSelectedContract] = useAtom(deployedSelectedContractAtom)

  const [inputs, setInputs] = useState<string[]>([])

  useEffect(() => {
    const constructor = selectedContract?.abi.find((abiElement) => {
      return abiElement.type === 'constructor'
    })

    if (constructor == undefined || constructor?.inputs == undefined) {
      setInputs([])
      return
    }

    setInputs(new Array(constructor?.inputs.length).fill(''))
  }, [selectedContract])

  async function deploy () {
    //   Deploy contract
    if (selectedContract == null) {
      remixClient.call(
        'notification' as any,
        'toast',
        'No contract selected'
      )

      return
    }

    if (account == null) {
      remixClient.call(
        'notification' as any,
        'toast',
        'No account selected'
      )

      return
    }

    remixClient.terminal.log({
      value: `Deploying contract ${selectedContract.contractName} with account ${account.address}`,
      type: 'info'
    })

    const factory = new zksync.ContractFactory(
      selectedContract.abi,
      selectedContract.bytecode,
      account
    )

    try {
      let contract: Contract = await factory.deploy(...inputs)

      remixClient.emit('statusChanged', {
        key: 'loading',
        type: 'info',
        title: `Contract ${selectedContract.contractName} is deploying!`
      })

      const tx = await contract.deployed()

      remixClient.emit('statusChanged', {
        key: 'succeed',
        type: 'success',
        title: `Contract ${selectedContract.contractName} deployed!`
      })

      const address = tx.address
      const txHash = tx.deployTransaction.hash

      const contractOutputTx = tx.deployTransaction

      contractOutputTx.data = contractOutputTx.data.slice(0, contractOutputTx.data.length / 3) + '...'

      // @ts-expect-error
      contractOutputTx.customData.factoryDeps = '[ <...> ]'

      remixClient.terminal.log({
        value: `${JSON.stringify(contractOutputTx, null, 2)}`,
        type: 'info'
      })

      const deployedContract = {
        ...selectedContract,
        bytecode: selectedContract.bytecode,
        transactionHash: txHash,
        address
      } as DeployedContract

      deployedSetContracts([deployedContract, ...deployedContracts])
      deployedSetSelectedContract(deployedContract)

      setActiveTab('interaction')

      const transaction = {
        type: 'deploy',
        txId: txHash,
        env: 'local'
      } as Transaction

      setTransactions([transaction, ...transactions])
    } catch (e) {
      remixClient.terminal.log({
        value: `Error: ${(e as any).code}`,
        type: 'error'
      })

      remixClient.emit('statusChanged', {
        key: 'failed',
        type: 'error',
        title: `Contract ${selectedContract.contractName} failed to deploy!`
      })

      remixClient.call(
        'notification' as any,
        'toast',
        `Error: ${(e as any).code}`
      )
    }
  }

  return (
    <>
      <Container>
        {contracts.length > 0
          ? (
                <div>
                  <CompiledContracts show={'contract'}></CompiledContracts>
                  {
                    (selectedContract != null)
                      ? <div>
                        <ConstructorInput inputs={inputs} setInputs={setInputs}></ConstructorInput>

                        <button
                          className="btn btn-primary btn-block d-block w-100 text-break mb-1 mt-2 px-0"
                          onClick={() => {
                            deploy()
                          }}
                        >
                          Deploy
                        </button>

                      </div>
                      : <>
                        </>
                  }
                </div>
            )
          : (
          <p>No contracts ready for deployment yet, compile a solidity contract</p>
            )}
      </Container>
    </>
  )
}

export default Deployment
