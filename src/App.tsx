import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import { Spinner } from './components/ui'
import { useApp, useConfigError } from './context/AppContext'
import CalendarScreen from './screens/CalendarScreen'
import ExpensesScreen from './screens/ExpensesScreen'
import LoginScreen from './screens/LoginScreen'
import SettingsScreen from './screens/SettingsScreen'
import SettlementScreen from './screens/SettlementScreen'
import SetupScreen from './screens/SetupScreen'
import TripsScreen from './screens/TripsScreen'

export default function App() {
  const configError = useConfigError()
  if (configError) return <SetupScreen message={configError} />

  return <AuthenticatedApp />
}

function AuthenticatedApp() {
  const { user, loading } = useApp()

  if (loading) return <Spinner label="Anmeldung wird geprüft …" />
  if (!user) return <LoginScreen />

  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<CalendarScreen />} />
        <Route path="fahrten" element={<TripsScreen />} />
        <Route path="kosten" element={<ExpensesScreen />} />
        <Route path="abrechnung" element={<SettlementScreen />} />
        <Route path="einstellungen" element={<SettingsScreen />} />
        <Route path="*" element={<CalendarScreen />} />
      </Route>
    </Routes>
  )
}
