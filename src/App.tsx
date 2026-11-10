import './App.css';
import Titlebar from './Titlebar';
import '@mantine/core/styles.css';
import { MantineProvider, createTheme } from '@mantine/core';
import { AppShell } from './components/AppShell';

const theme = createTheme({
  primaryColor: 'blue',
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  fontSizes: {
    xs: '10px',
    sm: '11px',
    md: '12px',
  },
});

export default function App() {
  return (
    <MantineProvider theme={theme} forceColorScheme="dark">
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Titlebar />
        <div style={{ flex: 1, minHeight: 0 }}>
          <AppShell />
        </div>
      </div>
    </MantineProvider>
  );
}
