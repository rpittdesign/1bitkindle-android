import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Share from "./pages/Share";

const App = () => (
  <BrowserRouter>
    <Routes>
      <Route path="/s/:id" element={<Share />} />
      <Route path="*" element={<Index />} />
    </Routes>
  </BrowserRouter>
);

export default App;
