import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppProvider } from "@/contexts/AppContext";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import Index from "./pages/Index";
import Conversations from "./pages/Conversations";
import Consumption from "./pages/Consumption";
import Agents from "./pages/Agents";
import Campaigns from "./pages/Campaigns";
import Alerts from "./pages/Alerts";
import Settings from "./pages/Settings";
import Users from "./pages/Users";
import Profiles from "./pages/Profiles";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import PendingApproval from "./pages/PendingApproval"; // Added import
import NotFound from "./pages/NotFound";
import Companies from "./pages/Companies";
import Governance from "./pages/Governance";
import Flows from "./pages/Flows";
import DecisionLogs from "./pages/DecisionLogs";
import Plans from "./pages/Plans";
import Contacts from "./pages/Contacts";
import LeadCRM from "@/pages/LeadCRM";
import Quality from "./pages/Quality";
import FinancialSummary from "./pages/FinancialSummary";
import SelectTenant from "./pages/SelectTenant";
import SystemStatus from "./pages/admin/SystemStatus";
import AIPerformanceCenter from "./pages/AIPerformanceCenter";
import ConversationObservatory from "./pages/ConversationObservatory";


const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AppProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            {/* Public Routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/select-tenant" element={<ProtectedRoute><SelectTenant /></ProtectedRoute>} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/pending-approval" element={<PendingApproval />} />

            {/* Protected Routes */}
            <Route path="/" element={<ProtectedRoute><Index /></ProtectedRoute>} />
            <Route path="/lead-crm" element={<ProtectedRoute><LeadCRM /></ProtectedRoute>} />
            <Route path="/conversations" element={<ProtectedRoute><Conversations /></ProtectedRoute>} />
            <Route path="/consumption" element={<ProtectedRoute><Consumption /></ProtectedRoute>} />
            <Route path="/agents" element={<ProtectedRoute><Agents /></ProtectedRoute>} />
            <Route path="/campaigns" element={<ProtectedRoute><Campaigns /></ProtectedRoute>} />
            <Route path="/alerts" element={<ProtectedRoute><Alerts /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
            <Route path="/users" element={<ProtectedRoute><Users /></ProtectedRoute>} />
            <Route path="/profiles" element={<ProtectedRoute><Profiles /></ProtectedRoute>} />
            <Route path="/companies" element={<ProtectedRoute><Companies /></ProtectedRoute>} />
            <Route path="/governance" element={<ProtectedRoute><Governance /></ProtectedRoute>} />
            <Route path="/flows" element={<ProtectedRoute><Flows /></ProtectedRoute>} />
            <Route path="/decision-logs" element={<ProtectedRoute><DecisionLogs /></ProtectedRoute>} />
            <Route path="/plans" element={<ProtectedRoute><Plans /></ProtectedRoute>} />
            <Route path="/contacts" element={<ProtectedRoute><Contacts /></ProtectedRoute>} />
            <Route path="/quality" element={<ProtectedRoute><Quality /></ProtectedRoute>} />
            <Route path="/contacts" element={<ProtectedRoute><Contacts /></ProtectedRoute>} />
            <Route path="/quality" element={<ProtectedRoute><Quality /></ProtectedRoute>} />
            <Route path="/financials" element={<ProtectedRoute><FinancialSummary /></ProtectedRoute>} />
            <Route path="/admin/status" element={<ProtectedRoute><SystemStatus /></ProtectedRoute>} />
            <Route path="/ai-performance" element={<ProtectedRoute><AIPerformanceCenter /></ProtectedRoute>} />
            <Route path="/observatory" element={<ProtectedRoute><ConversationObservatory /></ProtectedRoute>} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AppProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
