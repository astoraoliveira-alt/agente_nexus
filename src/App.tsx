import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppProvider } from "@/contexts/AppContext";
import Index from "./pages/Index";
import Conversations from "./pages/Conversations";
import Consumption from "./pages/Consumption";
import Agents from "./pages/Agents";
import Alerts from "./pages/Alerts";
import Settings from "./pages/Settings";
import Users from "./pages/Users";
import Profiles from "./pages/Profiles";
import Login from "./pages/Login";
import NotFound from "./pages/NotFound";
import Companies from "./pages/Companies";
import Governance from "./pages/Governance";
import Flows from "./pages/Flows";
import DecisionLogs from "./pages/DecisionLogs";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AppProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Index />} />
            <Route path="/conversations" element={<Conversations />} />
            <Route path="/consumption" element={<Consumption />} />
            <Route path="/agents" element={<Agents />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/users" element={<Users />} />
            <Route path="/profiles" element={<Profiles />} />
            <Route path="/companies" element={<Companies />} />
            <Route path="/governance" element={<Governance />} />
            <Route path="/flows" element={<Flows />} />
            <Route path="/decision-logs" element={<DecisionLogs />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AppProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
