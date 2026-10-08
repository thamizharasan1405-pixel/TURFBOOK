import { BrowserRouter, Route, Routes } from 'react-router-dom';
import PublicLayout from './layouts/PublicLayout';
import Home from './pages/Home';
import Explore from './pages/Explore';
import Placeholder from './pages/Placeholder';
import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import ForgotPassword from './pages/auth/ForgotPassword';
import ResetPassword from './pages/auth/ResetPassword';
import ProtectedRoute from './components/ProtectedRoute';
import CustomerDashboard from './pages/dashboard/CustomerDashboard';
import CustomerProfile from './pages/dashboard/CustomerProfile';
import OwnerDashboard from './pages/owner/OwnerDashboard';
import CreateTurf from './pages/owner/CreateTurf';
import OwnerBookings from './pages/owner/OwnerBookings';
import StaffManagement from './pages/owner/StaffManagement';
import Revenue from './pages/owner/Revenue';
import TurfDetails from './pages/turf/TurfDetails';
import Booking from './pages/Booking';
import Bookings from './pages/Bookings';
import BookingDetails from './pages/BookingDetails';
import AdminDashboard from './pages/admin/AdminDashboard';
import { Favourites, Notifications, Coupons } from './pages/Engagement';
import StaffQR from './pages/StaffQR';
import Reviews from './pages/Reviews';
import { Teams, Membership, Tournaments, Support, Reports } from './pages/Operations';
import Analytics from './pages/Analytics';
import OwnerOperations from './pages/OwnerOperations';
import Contact from './pages/Contact';

function AdminOnly() {
  return <ProtectedRoute roles={['ADMIN']}><AdminDashboard /></ProtectedRoute>;
}

export default function App() {
  return <BrowserRouter><Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/forgot-password" element={<ForgotPassword />} />
    <Route path="/reset-password" element={<ResetPassword />} />
    <Route path="/admin" element={<AdminOnly />} />
    <Route path="/admin/operations" element={<AdminOnly />} />
    <Route element={<PublicLayout />}>
      <Route path="/" element={<Home />} />
      <Route path="/explore" element={<Explore />} />
      <Route path="/register" element={<Register />} />
      <Route path="/contact" element={<Contact />} />
      <Route path="/turf/:id" element={<TurfDetails />} />
      <Route path="/book/:id" element={<Booking />} />
      <Route path="/bookings" element={<ProtectedRoute roles={['CUSTOMER']}><Bookings /></ProtectedRoute>} />
      <Route path="/booking/:id" element={<ProtectedRoute roles={['CUSTOMER']}><BookingDetails /></ProtectedRoute>} />
      <Route path="/dashboard" element={<ProtectedRoute roles={['CUSTOMER']}><CustomerDashboard /></ProtectedRoute>} />
      <Route path="/profile" element={<ProtectedRoute roles={['CUSTOMER']}><CustomerProfile /></ProtectedRoute>} />
      <Route path="/favourites" element={<ProtectedRoute roles={['CUSTOMER']}><Favourites /></ProtectedRoute>} />
      <Route path="/notifications" element={<ProtectedRoute roles={['CUSTOMER', 'OWNER', 'STAFF', 'ADMIN']}><Notifications /></ProtectedRoute>} />
      <Route path="/coupons" element={<ProtectedRoute roles={['CUSTOMER']}><Coupons /></ProtectedRoute>} />
      <Route path="/reviews" element={<Reviews />} />
      <Route path="/staff/qr" element={<ProtectedRoute roles={['STAFF', 'ADMIN']}><StaffQR /></ProtectedRoute>} />
      <Route path="/teams" element={<ProtectedRoute roles={['CUSTOMER']}><Teams /></ProtectedRoute>} />
      <Route path="/membership" element={<ProtectedRoute roles={['CUSTOMER']}><Membership /></ProtectedRoute>} />
      <Route path="/tournaments" element={<ProtectedRoute roles={['CUSTOMER', 'OWNER', 'ADMIN']}><Tournaments /></ProtectedRoute>} />
      <Route path="/support" element={<ProtectedRoute roles={['CUSTOMER', 'OWNER', 'STAFF', 'ADMIN']}><Support /></ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute roles={['OWNER', 'ADMIN']}><Reports /></ProtectedRoute>} />
      <Route path="/analytics" element={<ProtectedRoute roles={['OWNER', 'ADMIN']}><Analytics /></ProtectedRoute>} />
      <Route path="/owner/operations" element={<ProtectedRoute roles={['OWNER']}><OwnerOperations /></ProtectedRoute>} />
      <Route path="/owner" element={<ProtectedRoute roles={['OWNER']}><OwnerDashboard /></ProtectedRoute>} />
      <Route path="/owner/turfs/new" element={<ProtectedRoute roles={['OWNER']}><CreateTurf /></ProtectedRoute>} />
      <Route path="/owner/bookings" element={<ProtectedRoute roles={['OWNER']}><OwnerBookings /></ProtectedRoute>} />
      <Route path="/owner/staff" element={<ProtectedRoute roles={['OWNER']}><StaffManagement /></ProtectedRoute>} />
      <Route path="/owner/revenue" element={<ProtectedRoute roles={['OWNER']}><Revenue /></ProtectedRoute>} />
      <Route path="*" element={<Placeholder />} />
    </Route>
  </Routes></BrowserRouter>;
}
