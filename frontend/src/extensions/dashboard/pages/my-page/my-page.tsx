import React, { useState, useEffect, Component, type ErrorInfo, type ReactNode } from 'react';
import { 
  WixDesignSystemProvider,
  Page, 
  Card, 
  Table, 
  Dropdown, 
  Button, 
  Text, 
  Box as WixBox, 
  IconButton, 
  Loader,
  Badge
} from '@wix/design-system';
import { Delete, Add, ExternalLink, Check } from '@wix/wix-ui-icons-common';
import { dashboard } from '@wix/dashboard'; 
import '@wix/design-system/styles.global.css';

const Box = WixBox as any;

// Public backend tunnel URL
const BACKEND_URL = 'https://hearing-spotlight-submissions-cartoons.trycloudflare.com'; 
const DEFAULT_INSTANCE_ID = '889ffdc1-a3a8-4b61-a988-93af8c4fdec2';

/**
 * React Error Boundary to catch any unhandled rendering hiccups
 * and present a recovery card instead of a blank white screen.
 */
interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[DashboardErrorBoundary] Render error caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Box padding="30px" direction="vertical" align="center" width="100%">
          <Card>
            <Card.Header title="⚠️ Dashboard Display Notice" />
            <Card.Divider />
            <Card.Content>
              <Box direction="vertical" gap="12px">
                <Text weight="bold" skin="destructive">
                  An unexpected error occurred while rendering the dashboard.
                </Text>
                <Text size="small" secondary>
                  {this.state.error?.message || 'Component failed to mount.'}
                </Text>
                <Box marginTop="16px">
                  <Button 
                    priority="secondary" 
                    onClick={() => this.setState({ hasError: false, error: null })}
                  >
                    Reload Dashboard
                  </Button>
                </Box>
              </Box>
            </Card.Content>
          </Card>
        </Box>
      );
    }
    return this.props.children;
  }
}

/**
 * Main HubSpot Sync Dashboard Component
 */
function HubSpotSyncDashboardView() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [mappings, setMappings] = useState<any[]>([]);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [portalId, setPortalId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Safely resolve the Wix site instance ID with fallback and strict 36-char UUID validation
  const resolveInstanceId = (): string => {
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    try {
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const candidates = [
          params.get('instanceId'),
          params.get('tenantId'),
          params.get('siteId'),
          params.get('appInstanceId')
        ];
        for (const candidate of candidates) {
          if (candidate && UUID_REGEX.test(candidate.trim())) {
            return candidate.trim();
          }
        }
      }
      if (dashboard && (dashboard as any).instanceId) {
        const dashId = (dashboard as any).instanceId;
        if (typeof dashId === 'string' && UUID_REGEX.test(dashId.trim())) {
          return dashId.trim();
        }
      }
      if (dashboard && typeof (dashboard as any).getInstanceId === 'function') {
        const dashId = (dashboard as any).getInstanceId();
        if (typeof dashId === 'string' && UUID_REGEX.test(dashId.trim())) {
          return dashId.trim();
        }
      }
    } catch (err) {
      console.warn('Instance ID extraction fallback:', err);
    }
    return DEFAULT_INSTANCE_ID;
  };

  const instanceId = resolveInstanceId();

  const wixFields = [
    { id: 'firstname', value: 'First Name' },
    { id: 'lastname', value: 'Last Name' },
    { id: 'email', value: 'Email Address' },
    { id: 'phone', value: 'Phone Number' },
    { id: 'company', value: 'Company' }
  ];

  const hsFields = [
    { id: 'firstname', value: 'First Name (HubSpot)' },
    { id: 'lastname', value: 'Last Name (HubSpot)' },
    { id: 'email', value: 'Email (HubSpot)' },
    { id: 'phone', value: 'Phone Number (HubSpot)' },
    { id: 'company', value: 'Company (HubSpot)' }
  ];

  const directions = [
    { id: 'bi', value: 'Bi-Directional ↔' },
    { id: 'wix_to_hs', value: 'Wix → HubSpot' },
    { id: 'hs_to_wix', value: 'HubSpot → Wix' }
  ];

  // Default initial mapping template
  const defaultMappings = [
    { id: 1, wixField: 'firstname', hsField: 'firstname', direction: 'bi' },
    { id: 2, wixField: 'lastname', hsField: 'lastname', direction: 'bi' },
    { id: 3, wixField: 'email', hsField: 'email', direction: 'bi' },
    { id: 4, wixField: 'phone', hsField: 'phone', direction: 'bi' },
    { id: 5, wixField: 'company', hsField: 'company', direction: 'bi' }
  ];

  // Check connection status & fetch mappings on mount
  useEffect(() => {
    let isMounted = true;

    async function loadData() {
      try {
        // 1. Check HubSpot Connection Status
        try {
          const statusRes = await fetch(`${BACKEND_URL}/api/mappings/status/${instanceId}`);
          if (statusRes.ok) {
            const statusData = await statusRes.json();
            if (isMounted && statusData.success) {
              setIsConnected(statusData.connected);
              setPortalId(statusData.portalId);
            }
          }
        } catch (statusErr) {
          console.warn('Status check warning:', statusErr);
        }

        // 2. Fetch Field Mappings
        try {
          const mapRes = await fetch(`${BACKEND_URL}/api/mappings/${instanceId}`);
          if (mapRes.ok) {
            const result = await mapRes.json();
            if (isMounted) {
              if (result.success && Array.isArray(result.data) && result.data.length > 0) {
                setMappings(result.data);
              } else {
                setMappings(defaultMappings);
              }
            }
          } else {
            if (isMounted) setMappings(defaultMappings);
          }
        } catch (mapErr) {
          console.warn('Mappings fetch warning:', mapErr);
          if (isMounted) setMappings(defaultMappings);
        }
      } catch (err) {
        console.error('Initialization error:', err);
        if (isMounted) setMappings(defaultMappings);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadData();

    // Listen for postMessage from OAuth popup
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'HUBSPOT_OAUTH_SUCCESS') {
        setIsConnected(true);
        setNotification({ message: 'HubSpot account connected successfully!', type: 'success' });
        loadData();
      }
    };

    window.addEventListener('message', handleMessage);

    // Timeout safety fallback so preview never stays locked in loading
    const timer = setTimeout(() => {
      if (isMounted) setIsLoading(false);
    }, 4000);

    return () => {
      isMounted = false;
      window.removeEventListener('message', handleMessage);
      clearTimeout(timer);
    };
  }, [instanceId]);

  const addMappingRow = () => {
    const newId = mappings.length ? Math.min(...mappings.map(m => m.id)) - 1 : -1;
    setMappings([...mappings, { id: newId, wixField: '', hsField: '', direction: 'bi' }]);
  };

  const removeMapping = (id: number) => {
    setMappings(mappings.filter(m => m.id !== id));
  };

  const updateMapping = (id: number, key: string, value: string) => {
    setMappings(mappings.map(m => m.id === id ? { ...m, [key]: value } : m));
  };

  const showFeedback = (message: string, type: 'success' | 'error') => {
    setNotification({ message, type });
    try {
      if (dashboard && typeof (dashboard as any).showToast === 'function') {
        dashboard.showToast({ message, type });
      }
    } catch {
      // In editor preview, showToast might not exist
    }
    setTimeout(() => setNotification(null), 5000);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const validMappings = mappings.filter(m => m.wixField && m.hsField);
      const response = await fetch(`${BACKEND_URL}/api/mappings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wixInstanceId: instanceId,
          mappings: validMappings
        })
      });
      
      const result = await response.json();
      if (result.success) {
        showFeedback(`Successfully saved ${validMappings.length} field mapping rules!`, 'success');
      } else {
        throw new Error(result.message || 'Save failed');
      }
    } catch (error: any) {
      console.error('Save failed:', error);
      showFeedback(error.message || 'Failed to save mappings.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const initiateOAuth = () => {
    const oauthUrl = `${BACKEND_URL}/auth/hubspot?wixInstanceId=${encodeURIComponent(instanceId)}`;
    const width = 600;
    const height = 700;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;

    const popup = window.open(
      oauthUrl,
      'HubSpotOAuth',
      `width=${width},height=${height},top=${top},left=${left},scrollbars=yes`
    );

    if (!popup || popup.closed || typeof popup.closed === 'undefined') {
      // Fallback to top window redirect if popups blocked
      if (window.top) {
        window.top.location.href = oauthUrl;
      } else {
        window.location.href = oauthUrl;
      }
    }
  };

  if (isLoading) {
    return (
      <Box align="center" verticalAlign="middle" height="400px" width="100%">
        <Loader size="large" text="Loading HubSpot Integration..." />
      </Box>
    );
  }

  return (
    <Page>
      <Page.Header 
        title="HubSpot Integration" 
        subtitle="Real-time Bi-Directional Contact Synchronization & Field Mapping"
        actionsBar={
          <Button 
            priority="primary" 
            onClick={handleSave} 
            disabled={isSaving}
          >
            {isSaving ? 'Saving...' : 'Save Mappings'}
          </Button>
        }
      />
      <Page.Content>
        {notification && (
          <Box marginBottom="16px">
            <Card>
              <Card.Content>
                <Text weight="bold" skin={notification.type === 'success' ? 'standard' : 'destructive'}>
                  {notification.type === 'success' ? '✅ ' : '❌ '}
                  {notification.message}
                </Text>
              </Card.Content>
            </Card>
          </Box>
        )}

        {/* 1. Account Status Card */}
        <Box marginBottom="24px">
          <Card>
            <Card.Header 
              title="HubSpot Account Connection" 
              suffix={
                isConnected ? (
                  <Badge skin="success" size="medium" prefixIcon={<Check />}>
                    Connected {portalId ? `(Portal: ${portalId})` : ''}
                  </Badge>
                ) : (
                  <Button 
                    priority="secondary" 
                    prefixIcon={<ExternalLink />}
                    onClick={initiateOAuth}
                  >
                    Connect to HubSpot
                  </Button>
                )
              }
            />
            <Card.Divider />
            <Card.Content>
              <Box direction="vertical" gap="8px">
                <Text>
                  {isConnected 
                    ? 'Your HubSpot portal is authenticated and active. Contacts created or updated in Wix or HubSpot synchronize in real time.'
                    : 'Authenticate your HubSpot CRM account to enable real-time contact creation, updates, and idempotency-locked syncing.'}
                </Text>
                {isConnected && (
                  <Box marginTop="8px">
                    <Button priority="secondary" size="small" onClick={initiateOAuth}>
                      Reconnect / Switch Account
                    </Button>
                  </Box>
                )}
              </Box>
            </Card.Content>
          </Card>
        </Box>

        {/* 2. Field Mapping Rules Card */}
        <Card>
          <Card.Header 
            title="Field Mapping Rules" 
            subtitle="Configure which contact fields map between your Wix site and HubSpot CRM."
            suffix={
              <Button priority="secondary" size="small" prefixIcon={<Add />} onClick={addMappingRow}>
                Add Field Rule
              </Button>
            }
          />
          <Card.Divider />
          <Table 
            data={mappings} 
            columns={[
              { 
                title: 'Wix Contact Field', 
                render: (row: any) => (
                  <Dropdown 
                    options={wixFields} 
                    selectedId={row.wixField} 
                    placeholder="Select Wix field"
                    onSelect={(e: any) => updateMapping(row.id, 'wixField', e.id.toString())}
                  />
                )
              },
              { 
                title: 'Sync Direction', 
                width: '220px', 
                render: (row: any) => (
                  <Dropdown 
                    options={directions} 
                    selectedId={row.direction} 
                    placeholder="Select direction"
                    onSelect={(e: any) => updateMapping(row.id, 'direction', e.id.toString())}
                  />
                )
              },
              { 
                title: 'HubSpot CRM Property', 
                render: (row: any) => (
                  <Dropdown 
                    options={hsFields} 
                    selectedId={row.hsField} 
                    placeholder="Select HubSpot property"
                    onSelect={(e: any) => updateMapping(row.id, 'hsField', e.id.toString())}
                  />
                )
              },
              { 
                title: '', 
                width: '60px', 
                align: 'center',
                render: (row: any) => (
                  <IconButton 
                    priority="secondary" 
                    skin="destructive" 
                    size="small"
                    onClick={() => removeMapping(row.id)}
                  >
                    <Delete />
                  </IconButton>
                )
              }
            ]}
          >
            <Table.Content />
          </Table>
          
          <Box padding="16px" align="center">
            <Button priority="secondary" prefixIcon={<Add />} onClick={addMappingRow}>
              Add Mapping Row
            </Button>
          </Box>
        </Card>
      </Page.Content>
    </Page>
  );
}

/**
 * Top-level Export with WixDesignSystemProvider and ErrorBoundary wrappers
 */
export default function HubSpotSyncDashboard() {
  return (
    <ErrorBoundary>
      <WixDesignSystemProvider as="div">
        <HubSpotSyncDashboardView />
      </WixDesignSystemProvider>
    </ErrorBoundary>
  );
}
