import FiSearch from "@/components/FiSearch";

export default function Home() {
  return (
    <div className="flex flex-1 flex-col items-center bg-zinc-50 px-6 py-24 dark:bg-black">
      <div className="flex w-full max-w-xl flex-col items-center gap-8 text-center">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Curinos Client Intelligence
          </h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            Select a financial institution to map its financials and recent news to
            the Curinos products that would help it most.
          </p>
        </div>
        <FiSearch />
      </div>
    </div>
  );
}
