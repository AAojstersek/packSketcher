import Image from 'next/image'

export default function Loading() {
  return (
    <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-slate-950 px-6 text-center">
      <Image
        src="/logo/PSlogoWhite.svg"
        alt="PackSketcher logo"
        width={84}
        height={84}
        priority
        className="h-[84px] w-[84px]"
      />
      <h1 className="mt-5 text-2xl font-semibold tracking-tight text-white">PackSketcher</h1>
      <p className="mt-2 text-sm text-slate-300">Loading...</p>
      <div className="mt-4 h-1.5 w-28 overflow-hidden rounded-full bg-slate-800">
        <div className="h-full w-1/2 animate-pulse rounded-full bg-white/80" />
      </div>
    </main>
  )
}
