import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/context/AuthContext";
import { BreadcrumbProvider } from "@/context/BreadcrumbContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import Connections from "@/pages/Connections";
import Catalog from "@/pages/Catalog";
import Templates from "@/pages/Templates";
import TemplateForm from "@/pages/TemplateForm";
import Products from "@/pages/Products";
import History from "@/pages/History";
import MyFiles from "@/pages/MyFiles";
import Settings from "@/pages/Settings";
import Landing from "@/pages/Landing";
import CreateListing from "./pages/CreateListing";
import EditListing from "./pages/EditListing";


import { Toaster } from "@/components/ui/sonner";


function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <BreadcrumbProvider>
            <Routes>
              <Route path="/" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
                <Route path="/connections" element={<Connections />} />
                <Route path="/blueprints" element={<Catalog />} />
                <Route path="/templates" element={<Templates />} />
                <Route path="/templates/new" element={<TemplateForm />} />
                <Route path="/templates/:id" element={<TemplateForm />} />
                <Route path="/products" element={<Products />} />
                <Route path="/products/:id" element={<EditListing />} />
                <Route path="/history" element={<History />} />
                <Route path="/files" element={<MyFiles />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/create" element={<CreateListing />} />
              </Route>
            </Routes>
          </BreadcrumbProvider>
        </AuthProvider>
      </BrowserRouter>
      <Toaster />
    </ThemeProvider>
  );
}

export default App;