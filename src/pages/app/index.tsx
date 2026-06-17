import { Completion } from "./components";
import { useApp } from "@/hooks";

const App = () => {
  useApp(); // Setup initial DB structures strictly

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