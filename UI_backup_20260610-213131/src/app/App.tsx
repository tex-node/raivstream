/* MARKER-MAKE-KIT-INVOKED */
import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import { Layout } from "./components/Layout";
import { HomeFeed } from "./components/HomeFeed";
import { R16KidsFeed } from "./components/R16KidsFeed";
import { AIStudio } from "./components/AIStudio";
import { StoryStudio } from "./components/StoryStudio";
import { UploadFlow } from "./components/UploadFlow";
import { CreatorProfile } from "./components/CreatorProfile";
import { Analytics } from "./components/Analytics";
import { CreditsPage } from "./components/CreditsPage";
import { PricingPage } from "./components/PricingPage";
import { AuthScreens } from "./components/AuthScreens";
import { AdminOverview } from "./components/AdminOverview";
import { AdminUsers } from "./components/AdminUsers";
import { AdminCredits } from "./components/AdminCredits";
import { AdminModeration } from "./components/AdminModeration";
import { AdminJobs } from "./components/AdminJobs";
import { SearchPage } from "./components/SearchPage";
import { SettingsPage } from "./components/SettingsPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<HomeFeed />} />
          <Route path="r16" element={<R16KidsFeed />} />
          <Route path="search" element={<SearchPage />} />
          <Route path="upload" element={<UploadFlow />} />
          <Route path="ai-studio" element={<AIStudio />} />
          <Route path="story-studio" element={<StoryStudio />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="credits" element={<CreditsPage />} />
          <Route path="pricing" element={<PricingPage />} />
          <Route path="profile" element={<CreatorProfile />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="signin" element={<AuthScreens />} />
          <Route path="admin" element={<AdminOverview />} />
          <Route path="admin/users" element={<AdminUsers />} />
          <Route path="admin/credits" element={<AdminCredits />} />
          <Route path="admin/moderation" element={<AdminModeration />} />
          <Route path="admin/jobs" element={<AdminJobs />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
