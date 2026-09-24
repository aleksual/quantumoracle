'use client'

import { useEffect, useMemo, useState } from 'react'
import { connect, openContractCall } from '@stacks/connect'
import { uintCV } from '@stacks/transactions'
import { Activity, ArrowDownRight, ArrowUpRight, ChevronDown, CircleHelp, Crosshair, Gauge, Menu, Radio, ShieldCheck, Sparkles, Trophy, Wallet, Zap } from 'lucide-react'

type BetKind = 'mine-win' | 'mine-loss' | 'other'

type BlockBet = {
  id: string
  player: string
  amount: number
  kind: BetKind
  direction: 'UP' | 'DOWN'
}

type OracleBlock = {
  height: number
  hash: string
  time: string
  bets: BlockBet[]
}

const initialBlocks: OracleBlock[] = [
  { height: 1842, hash: '9f3a…c81d', time: '12 sec ago', bets: [{ id: '1', player: 'You', amount: 10, kind: 'mine-win', direction: 'UP' }, { id: '2', player: '0x7a…91', amount: 24, kind: 'other', direction: 'DOWN' }, { id: '3', player: '0x2c…44', amount: 8, kind: 'other', direction: 'UP' }] },
  { height: 1841, hash: '4b72…a0e9', time: '1 min ago', bets: [{ id: '4', player: 'You', amount: 12, kind: 'mine-loss', direction: 'DOWN' }, { id: '5', player: '0x9d…e2', amount: 31, kind: 'other', direction: 'UP' }, { id: '6', player: '0x4f…18', amount: 6, kind: 'other', direction: 'DOWN' }] },
  { height: 1840, hash: 'a16c…730b', time: '2 min ago', bets: [{ id: '7', player: '0x1e…55', amount: 18, kind: 'other', direction: 'UP' }, { id: '8', player: '0x8b…c4', amount: 9, kind: 'other', direction: 'UP' }, { id: '9', player: 'You', amount: 10, kind: 'mine-win', direction: 'UP' }] },
]

const initialCandles = [
  { x: 18, open: 108, close: 92, high: 82, low: 120, up: true },
  { x: 48, open: 95, close: 114, high: 84, low: 126, up: false },
  { x: 78, open: 113, close: 76, high: 66, low: 124, up: true },
  { x: 108, open: 80, close: 91, high: 70, low: 105, up: false },
  { x: 138, open: 90, close: 57, high: 50, low: 102, up: true },
  { x: 168, open: 58, close: 77, high: 45, low: 88, up: false },
  { x: 198, open: 76, close: 42, high: 35, low: 88, up: true },
  { x: 228, open: 43, close: 61, high: 30, low: 74, up: false },
  { x: 258, open: 60, close: 29, high: 22, low: 70, up: true },
  { x: 288, open: 28, close: 48, high: 16, low: 56, up: false },
]

export default function Page() {
  const [angle, setAngle] = useState(0.8)
  const [arrowTip, setArrowTip] = useState({ x: initialCandles.at(-1)?.x ?? 288, y: initialCandles.at(-1)?.close ?? 48 })
  const [candles, setCandles] = useState(initialCandles)
  const [candleTick, setCandleTick] = useState(0)
  const [btcPrice, setBtcPrice] = useState<number | null>(null)
  const [priceDelta, setPriceDelta] = useState(0)
  const [balance, setBalance] = useState(0)
  const [status, setStatus] = useState<'idle' | 'running' | 'win' | 'loss'>('idle')
  const [lastReward, setLastReward] = useState<number | null>(null)
  const [round, setRound] = useState(14)
  const [walletConnected, setWalletConnected] = useState(false)
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [faucetStatus, setFaucetStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [faucetMessage, setFaucetMessage] = useState('')
  const [contractTxId, setContractTxId] = useState<string | null>(null)
  const [betAmount, setBetAmount] = useState(10)
  const [blocks, setBlocks] = useState(initialBlocks)
  const [assemblingBlock, setAssemblingBlock] = useState(false)
  const angleLabel = `${angle >= 0 ? '+' : ''}${angle.toFixed(2)} rad`
  const angleDegrees = Math.round(angle * 90)
  const rewardPreview = useMemo(() => Math.max(0, Math.abs(angle) * 92 + 9), [angle])
  const firstCandle = candles[0]
  const lastCandle = candles[candles.length - 1]
  const trendDirection = lastCandle.close - firstCandle.close
  const trendPercent = btcPrice && priceDelta ? (priceDelta / btcPrice) * 100 : 0
  const chartOrigin = { x: 0, y: 150 }

  useEffect(() => {
    let previousPrice: number | null = null

    async function updateMarket() {
      try {
        const response = await fetch(`/api/btc?t=${Date.now()}`, { cache: 'no-store' })
        if (!response.ok) return
        const data = await response.json()
        const nextPrice = Number(data.price)
        if (!Number.isFinite(nextPrice) || nextPrice <= 0) return
        const delta = previousPrice === null ? 0 : nextPrice - previousPrice
        previousPrice = nextPrice
        setBtcPrice(nextPrice)
        setPriceDelta(delta)
        setCandleTick((value) => value + 1)
        setCandles((current) => {
          const previous = current[current.length - 1]
          const move = Math.max(-18, Math.min(18, delta === 0 ? 0 : delta / Math.max(nextPrice, 1) * 120000))
          const close = Math.max(18, Math.min(132, previous.close - move))
          const open = previous.close
          const high = Math.max(open, close) - 10
          const low = Math.min(open, close) + 10
          const next = { x: 288, open, close, high, low, up: close < open }
          return [...current.slice(1), next].map((c, index) => ({ ...c, x: 18 + index * 30 }))
        })
      } catch {
        // Keep the most recent chart state when the market endpoint is unavailable.
      }
    }

    updateMarket()
    const interval = window.setInterval(updateMarket, 2000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!walletAddress) {
      setBalance(0)
      return
    }

    let cancelled = false
    async function updateBalance() {
      try {
        const response = await fetch(`/api/stacks/balance?address=${encodeURIComponent(walletAddress)}`, { cache: 'no-store' })
        if (!response.ok) return
        const data = await response.json()
        if (!cancelled && Number.isFinite(Number(data.balance))) setBalance(Number(data.balance))
      } catch {
        // Keep the last known balance when the Hiro API is temporarily unavailable.
      }
    }

    updateBalance()
    const interval = window.setInterval(updateBalance, 10_000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [walletAddress])

  useEffect(() => {
    const interval = window.setInterval(() => {
      setAssemblingBlock(true)
      window.setTimeout(() => {
        setBlocks((current) => [{
          height: current[0].height + 1,
          hash: `${Math.random().toString(16).slice(2, 6)}…${Math.random().toString(16).slice(2, 6)}`,
          time: 'just now',
          bets: [
            { id: `new-${Date.now()}`, player: 'You', amount: betAmount, kind: Math.random() > 0.35 ? 'mine-win' : 'mine-loss', direction: angle >= 0 ? 'UP' : 'DOWN' },
            { id: `new-other-${Date.now()}`, player: '0x6e…b2', amount: 16, kind: 'other', direction: 'UP' },
            { id: `new-other-2-${Date.now()}`, player: '0xa1…7c', amount: 7, kind: 'other', direction: 'DOWN' },
          ],
        }, ...current].slice(0, 4))
        setAssemblingBlock(false)
      }, 650)
    }, 9000)
    return () => window.clearInterval(interval)
  }, [angle, betAmount])

  useEffect(() => {
    if (status !== 'running') return
    const timer = window.setTimeout(() => {
      const isWin = Math.random() > 0.28
      const reward = isWin ? rewardPreview : -Math.max(12, rewardPreview * 0.72)
      setStatus(isWin ? 'win' : 'loss')
      setLastReward(reward)
      setRound((value) => value + 1)
    }, 1450)
    return () => window.clearTimeout(timer)
  }, [status, rewardPreview])

  async function placeBid() {
    if (status === 'running' || !walletConnected) return
    setLastReward(null)
    setContractTxId(null)
    setStatus('running')

    try {
      const amountMicroStx = Math.round(betAmount * 1_000_000)
      const deltaR = Math.round(Math.abs(angle) * 1_000_000)
      await openContractCall({
        contractAddress: process.env.NEXT_PUBLIC_CONTRACT_ADDRESS ?? 'ST225ER9XSGMTAXV8XHWYDY50PCR3X6RSR8J7FJ8B',
        contractName: process.env.NEXT_PUBLIC_CONTRACT_NAME ?? 'rebalancer',
        functionName: 'deposit',
        functionArgs: [uintCV(amountMicroStx), uintCV(deltaR)],
        network: process.env.NEXT_PUBLIC_STACKS_NETWORK ?? 'testnet',
        onFinish: ({ txId }: { txId: string }) => {
          setContractTxId(txId)
          setStatus('idle')
        },
        onCancel: () => setStatus('idle'),
      } as Parameters<typeof openContractCall>[0])
    } catch {
      setStatus('idle')
    }
  }

  async function requestTestStx() {
    if (!walletAddress || faucetStatus === 'loading') return
    setFaucetStatus('loading')
    setFaucetMessage('Requesting test STX...')
    try {
      const response = await fetch('/api/faucet', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address: walletAddress }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? 'Faucet request failed.')
      setFaucetStatus('success')
      setFaucetMessage(data.txId ? `Faucet tx: ${data.txId.slice(0, 10)}...` : 'Test STX requested.')
    } catch (error) {
      setFaucetStatus('error')
      setFaucetMessage(error instanceof Error ? error.message : 'Faucet request failed.')
    }
  }

  function updateArrowFromPointer(event: React.PointerEvent<HTMLDivElement>) {
    const svg = event.currentTarget.querySelector('svg[aria-label="Candlestick market chart"]')
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const x = Math.max(18, Math.min(322, ((event.clientX - rect.left) / rect.width) * 340))
    const y = Math.max(12, Math.min(138, ((event.clientY - rect.top) / rect.height) * 150))
    setArrowTip({ x, y })
    setAngle(Math.max(-1, Math.min(1, (firstCandle.close - y) / 60)))
  }

  return (
    <main className="min-h-screen bg-[#070909] px-4 py-4 text-[#f4f7f4] sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-md flex-col overflow-hidden rounded-[28px] border border-white/[0.08] bg-[#0c1010] shadow-2xl shadow-black/50">
        <header className="flex items-center justify-between px-5 pb-4 pt-5">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-[#c8ff32] text-[#10150b] shadow-[0_0_20px_rgba(200,255,50,.2)]"><Crosshair size={19} strokeWidth={2.5} /></div>
            <div><p className="font-mono text-[12px] font-bold uppercase tracking-[0.22em]">QUANTUM ORACLE</p><p className="mt-0.5 text-[10px] uppercase tracking-[0.18em] text-white/35">risk arena / live</p></div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={async () => {
                try {
                  const response = await connect({ forceWalletSelect: true })
                  const address = (response as { addresses?: Array<{ address?: string }> }).addresses?.[0]?.address ?? null
                  setWalletAddress(address)
                  setWalletConnected(true)
                } catch {
                  // Wallet selection can be cancelled by the user.
                }
              }}
              className="flex items-center gap-1.5 rounded-xl bg-[#c8ff32] px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[#10150b] shadow-[0_0_18px_rgba(200,255,50,.16)] transition hover:bg-[#d5ff68] active:scale-95"
            >
              <Wallet size={13} strokeWidth={2.5} />
              {walletConnected ? 'Connected' : 'Connect Wallet'}
            </button>
            <button aria-label="Open menu" className="rounded-full p-2 text-white/45 transition hover:bg-white/5 hover:text-white"><Menu size={19} /></button>
          </div>
        </header>

        <section className="px-4 pt-6">
          <div className="mb-3 flex items-center justify-between"><div><p className="text-[10px] uppercase tracking-[0.2em] text-white/35">genesis block</p><h1 className="mt-1 text-lg font-semibold tracking-tight">Price momentum <span className="text-white/25">/ 1m</span></h1></div><div className={`flex items-center gap-1.5 font-mono text-xs ${trendPercent >= 0 ? 'text-[#c8ff32]' : 'text-[#ff5964]'}`}><ArrowUpRight size={14} /> {btcPrice ? `${trendPercent >= 0 ? '+' : ''}${trendPercent.toFixed(2)}%` : 'syncing'}</div></div>
          <div className="relative aspect-square w-full touch-none overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0b1110] p-3" aria-label="BTC candlestick chart" onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); updateArrowFromPointer(event) }} onPointerMove={(event) => { if (event.buttons === 1) updateArrowFromPointer(event) }}>
            <div className="pointer-events-none absolute inset-0 opacity-40" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.06) 1px, transparent 1px)', backgroundSize: '100% 44px, 37px 100%' }} />
            <div className="pointer-events-none absolute inset-y-9 left-0 z-10 flex flex-col justify-between py-0.5 font-mono text-[9px] text-white/35"><span>$40,000</span><span>$30,000</span><span>$20,000</span><span>$10,000</span><span>$0</span></div>
            <div className="absolute left-3 top-3 flex items-center gap-2 text-[10px] font-medium text-white/35"><Activity size={12} /> BTC / GENESIS</div>
            <svg viewBox="0 0 340 150" className={`absolute inset-x-3 bottom-5 top-9 z-10 h-[calc(100%-56px)] w-[calc(100%-24px)] ${status === 'running' ? 'opacity-70' : ''}`} preserveAspectRatio="none" aria-label="Candlestick market chart">
              <g key={candleTick} className="candle-slide">
                {candles.map((c) => <g key={c.x} className="opacity-80"><line x1={c.x} x2={c.x} y1={c.high} y2={c.low} stroke={c.up ? '#c8ff32' : '#ff5964'} strokeWidth="1" /><rect x={c.x - 4} y={Math.min(c.open, c.close)} width="8" height={Math.max(5, Math.abs(c.open - c.close))} rx="1" fill={c.up ? '#c8ff32' : '#ff5964'} /></g>)}
              </g>
            </svg>
            <svg viewBox="0 0 340 150" className="pointer-events-none absolute inset-x-3 bottom-5 top-9 z-20 h-[calc(100%-56px)] w-[calc(100%-24px)] overflow-visible" preserveAspectRatio="none" aria-hidden="true">
              <defs><marker id="trend-arrowhead" markerWidth="10" markerHeight="10" refX="8" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 Z" fill="#c8ff32" /></marker></defs>
              <g>
                <line x1={chartOrigin.x} y1={chartOrigin.y} x2={arrowTip.x} y2={arrowTip.y} stroke="#c8ff32" strokeWidth="2.5" strokeLinecap="round" markerEnd="url(#trend-arrowhead)" style={{ filter: 'drop-shadow(0 0 6px rgba(200,255,50,.85))' }} />
                <circle cx={chartOrigin.x} cy={chartOrigin.y} r="4" fill="#c8ff32" stroke="#0b1110" strokeWidth="2" />
                <text x="7" y="146" fill="#c8ff32" fontSize="8" fontFamily="monospace">$0</text>
              </g>
            </svg>
            <div className="absolute bottom-3 left-3 rounded bg-black/30 px-1.5 py-1 font-mono text-[9px] text-white/45">tap chart to set angle · {angleDegrees}°</div>
            <div className="absolute bottom-2 left-3 right-3 flex justify-between font-mono text-[9px] text-white/20"><span>09:41</span><span>09:46</span><span>09:51</span><span>09:56</span></div>
          </div>
        </section>

        <section className="px-4 pt-5">
          <div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2"><Gauge size={15} className="text-[#58d9ff]" /><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50">risk angle</p></div><span className={`font-mono text-sm font-bold ${angle >= 0 ? 'text-[#c8ff32]' : 'text-[#ff5964]'}`}>{angleLabel}</span></div>
          <div className="rounded-2xl border border-white/[0.07] bg-[#111716] p-4">
            <input aria-label="Risk angle" type="range" min="-1" max="1" step="0.01" value={angle} onChange={(e) => { const nextAngle = Number(e.target.value); setAngle(nextAngle); setArrowTip({ x: lastCandle.x, y: Math.max(12, Math.min(138, firstCandle.close - nextAngle * 60)) }) }} className="risk-slider w-full" style={{ '--fill': `${((angle + 1) / 2) * 100}%` } as React.CSSProperties} />
            <div className="mt-3 flex justify-between font-mono text-[10px] text-white/30"><span>−1.00 bearish</span><span>neutral</span><span>+1.00 bullish</span></div>
            <div className="mt-4 border-t border-white/[0.06] pt-3"><div className="flex items-center justify-between"><span className="text-[11px] text-white/35">estimated reward</span><span className="font-mono text-sm text-[#c8ff32]">+${rewardPreview.toFixed(2)}</span></div><p className="mt-2 truncate font-mono text-[9px] text-white/20" title="Reward = ΔR² / (|ΔR − ΔR_NS| + ε) − ΔR">R = ΔR² / (|ΔR − ΔR_NS| + ε) − ΔR</p></div>
          </div>
        </section>

        <section className="mt-auto px-4 pb-5 pt-5">
          {status !== 'idle' && <div className={`mb-3 flex items-center gap-3 rounded-xl border px-3 py-2.5 text-xs ${status === 'running' ? 'border-[#58d9ff]/20 bg-[#58d9ff]/5 text-[#58d9ff]' : status === 'win' ? 'border-[#c8ff32]/20 bg-[#c8ff32]/5 text-[#c8ff32]' : 'border-[#ff5964]/20 bg-[#ff5964]/5 text-[#ff5964]'}`}><Sparkles size={14} className={status === 'running' ? 'animate-spin' : ''} /><span>{status === 'running' ? 'Genesis block is resolving...' : status === 'win' ? `BID confirmed · +$${lastReward?.toFixed(2)}` : `BID missed · -$${Math.abs(lastReward ?? 0).toFixed(2)}`}</span><span className="ml-auto font-mono text-[10px] uppercase">{status === 'running' ? 'pending' : status}</span></div>}
          <div className="mb-3 rounded-2xl border border-white/[0.07] bg-[#111716] p-2">
            <div className="flex items-center justify-between gap-2">
              <button type="button" aria-label="Decrease bet by one dollar" onClick={() => setBetAmount((value) => Math.max(1, value - 1))} disabled={status === 'running' || betAmount <= 1} className="flex size-11 items-center justify-center rounded-xl border border-white/[0.08] text-xl text-white/65 transition hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-30">−</button>
              <label className="flex flex-1 items-center justify-center gap-1 font-mono text-2xl font-semibold text-white">
                <span className="text-[#c8ff32]">$</span>
                <input aria-label="Bet amount in dollars" type="number" min="1" step="1" value={betAmount} onChange={(event) => setBetAmount(Math.max(1, Number(event.target.value) || 1))} disabled={status === 'running'} className="w-24 bg-transparent text-center font-mono text-2xl font-semibold outline-none [appearance:textfield] disabled:opacity-50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
              </label>
              <button type="button" aria-label="Increase bet by one dollar" onClick={() => setBetAmount((value) => value + 1)} disabled={status === 'running'} className="flex size-11 items-center justify-center rounded-xl border border-white/[0.08] text-xl text-white/65 transition hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-30">+</button>
            </div>
            <p className="mt-1 text-center font-mono text-[9px] uppercase tracking-[0.16em] text-white/25">bet amount</p>
          </div>
          <button onClick={placeBid} disabled={status === 'running' || !walletConnected} className="group flex h-16 w-full items-center justify-center gap-3 rounded-2xl bg-[#c8ff32] font-mono text-lg font-black tracking-[0.2em] text-[#10150b] shadow-[0_8px_30px_rgba(200,255,50,.16)] transition hover:scale-[1.01] hover:bg-[#d5ff68] active:scale-[.98] disabled:cursor-wait disabled:opacity-60"><Zap size={19} fill="currentColor" /> {status === 'running' ? 'PROCESSING' : walletConnected ? 'BID' : 'CONNECT WALLET'} <span className="text-xs tracking-normal opacity-50">↵</span></button>
          {contractTxId && <a href={`https://explorer.hiro.so/txid/${contractTxId}?chain=testnet`} target="_blank" rel="noreferrer" className="mt-2 block truncate text-center font-mono text-[9px] text-[#58d9ff]">contract tx: {contractTxId}</a>}
          <section className="mt-4 rounded-2xl border border-white/[0.07] bg-[#111716] px-4 py-4">
            <div className="flex items-start justify-between"><div><p className="text-[10px] uppercase tracking-[0.18em] text-white/35">available balance</p><p className="mt-1 font-mono text-[27px] font-semibold tracking-tight">{balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 6 })} <span className="text-sm text-white/45">STX</span></p></div><div className="rounded-lg border border-[#c8ff32]/20 bg-[#c8ff32]/10 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-[#c8ff32]">+12.4%</div></div>
            <div className="mt-4 flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-white/35"><Wallet size={12} /> round {String(round).padStart(2, '0')} <span className="ml-auto flex items-center gap-1.5 text-[#c8ff32]"><Radio size={10} className="animate-pulse" /> market live</span></div>
            <button type="button" onClick={requestTestStx} disabled={!walletConnected || faucetStatus === 'loading'} className="mt-4 flex w-full items-center justify-center rounded-xl border border-[#58d9ff]/25 bg-[#58d9ff]/10 px-3 py-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[#58d9ff] transition hover:bg-[#58d9ff]/15 disabled:cursor-not-allowed disabled:opacity-35">{faucetStatus === 'loading' ? 'Requesting test STX...' : 'Get test STX from Faucet'}</button>
            {faucetMessage && <p className={`mt-2 truncate text-center font-mono text-[9px] ${faucetStatus === 'error' ? 'text-[#ff5964]' : 'text-white/35'}`} title={faucetMessage}>{faucetMessage}</p>}
          </section>
          <div className="mt-4 flex items-center justify-center gap-5 text-[10px] uppercase tracking-[0.14em] text-white/25"><span className="flex items-center gap-1.5"><ShieldCheck size={12} /> provably fair</span><span className="flex items-center gap-1.5"><Trophy size={12} /> win rate 78%</span><CircleHelp size={13} /></div>

          <section className="mt-5 border-t border-white/[0.06] pt-5">
            <div className="mb-3 flex items-center justify-between">
              <div><p className="text-[10px] uppercase tracking-[0.2em] text-white/35">oracle chain</p><h2 className="mt-1 text-lg font-semibold tracking-tight">Previous blocks</h2></div>
              <div className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-white/35"><span className={`size-1.5 rounded-full ${assemblingBlock ? 'animate-ping bg-[#58d9ff]' : 'bg-[#c8ff32]'}`} /> {assemblingBlock ? 'building' : 'live'}</div>
            </div>
            <div className="flex flex-col gap-2">
              {blocks.map((block, index) => <article key={`${block.height}-${block.hash}`} className={`rounded-2xl border border-white/[0.07] bg-[#111716] p-3 ${index === 0 && assemblingBlock ? 'block-build' : ''}`}>
                <div className="mb-2 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.12em] text-white/35"><span className="text-[#58d9ff]">block #{block.height}</span><span>{block.time}</span></div>
                <div className="mb-3 flex items-center justify-between"><span className="font-mono text-[10px] text-white/45">{block.hash}</span><span className="text-[9px] uppercase tracking-[0.1em] text-white/25">{block.bets.length} bets</span></div>
                <div className="flex flex-wrap gap-1.5">
                  {block.bets.map((bet) => <div key={bet.id} title={`${bet.player} · $${bet.amount} · ${bet.direction}`} className={`flex items-center gap-1.5 rounded-lg border px-2 py-1.5 font-mono text-[10px] ${bet.kind === 'mine-win' ? 'border-[#c8ff32]/35 bg-[#c8ff32]/10 text-[#c8ff32]' : bet.kind === 'mine-loss' ? 'border-[#ff5964]/35 bg-[#ff5964]/10 text-[#ff5964]' : 'border-[#a855f7]/35 bg-[#a855f7]/10 text-[#c084fc]'}`}><span className="font-bold">{bet.player}</span><span className="opacity-70">${bet.amount}</span><span className="text-[8px] opacity-60">{bet.direction}</span></div>)}
                </div>
              </article>)}
            </div>
            <div className="mt-2 flex items-center justify-center gap-2 text-[9px] font-mono uppercase tracking-[0.12em] text-white/30"><span className="size-1.5 rounded-full bg-[#c8ff32]" /> your win <span className="ml-2 size-1.5 rounded-full bg-[#ff5964]" /> your loss <span className="ml-2 size-1.5 rounded-full bg-[#a855f7]" /> other players</div>
          </section>
        </section>
        <footer className="flex items-center justify-between border-t border-white/[0.06] px-5 py-3 text-[9px] uppercase tracking-[0.16em] text-white/20"><span>network: genesis testnet</span><span className="flex items-center gap-1">v0.8 <ChevronDown size={11} /></span></footer>
      </div>
    </main>
  )
}
