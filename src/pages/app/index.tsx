import { Completion } from "./components";
import { useAppInit } from "@/hooks";

const App = () => {
  useAppInit(); // Setup initial DB structures & listeners strictly without Context collision

  return (
      <div
        data-slot="card"
        className="w-screen h-screen flex overflow-hidden flex-col"
      >
        <Completion />
      </div>
  );
};

export default App;