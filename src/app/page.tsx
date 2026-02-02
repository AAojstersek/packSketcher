import Image from 'next/image'

export default function Home() {
  return (
    <main className="p-8">
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <Image
          src="/logo/PSlogoBlack.svg"
          alt=""
          width={32}
          height={32}
          className="shrink-0"
        />
        <span>pack-sketcher</span>
      </h1>
      <p className="mt-2 text-neutral-600">
        Setup OK. Next: Auth + Dashboard.
      </p>
    </main>
  );
}
