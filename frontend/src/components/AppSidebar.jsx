/**
 * AppSidebar Component
 *
 * Collapsible navigation sidebar with branding, menu items, and toggle controls.
 *
 * Features:
 * - Redux-controlled visibility state
 * - Unfoldable/narrow mode for more screen space
 * - Brand logo with full and narrow variants
 * - Close button for mobile devices
 * - Footer with toggle button
 * - Dark color scheme
 * - Fixed positioning
 *
 * @component
 * @example
 * return (
 *   <AppSidebar />
 * )
 */

import React, { useCallback, useEffect, useState } from 'react'
import { useSelector, useDispatch } from 'react-redux'

import {
  CButton,
  CCloseButton,
  CForm,
  CFormCheck,
  CFormInput,
  CFormLabel,
  CSidebar,
  CSidebarBrand,
  CSidebarHeader,
  CSidebarNav,
} from '@coreui/react'

import { useFilters } from '../context/FiltersContext'
import { API_BASE_URL } from '../config/api'
import teamBlueLogo from '../assets/images/TeamBlueLogoCropped.png'

const airlineOptions = [
  'Delta Air Lines Inc.',
  'United Air Lines Inc.',
  'Southwest Airlines Co.',
  'American Airlines Inc.',
  'JetBlue Airways',
]
const airportOptions = ['ATL', 'ORD', 'DEN', 'LAX', 'JFK']
const delayTypeOptions = ['Weather', 'Aircraft', 'Carrier', 'NAS', 'Security']

const toggleValue = (values, value) => {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value]
}

/**
 * AppSidebar functional component
 *
 * Manages sidebar state with Redux:
 * - sidebarShow: Controls sidebar visibility
 * - sidebarUnfoldable: Controls narrow/wide mode
 *
 * Renders navigation from _nav.js configuration file.
 * Memoized to prevent unnecessary re-renders.
 *
 * @returns {React.ReactElement} Sidebar with navigation
 */
const AppSidebar = () => {
  const dispatch = useDispatch()
  const unfoldable = useSelector((state) => state.sidebarUnfoldable)
  const sidebarShow = useSelector((state) => state.sidebarShow)
  const { filters, setFilters } = useFilters()

  const [presets, setPresets] = useState([])
  const [presetName, setPresetName] = useState('')
  const [savingPreset, setSavingPreset] = useState(false)

  const fetchPresets = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/presets`)
      if (res.ok) setPresets(await res.json())
    } catch {
      //silent — sidebar should not break if backend is down
    }
  }, [])

  useEffect(() => {
    fetchPresets()
  }, [fetchPresets])

  const savePreset = async () => {
    if (!presetName.trim()) return
    setSavingPreset(true)
    try {
      await fetch(`${API_BASE_URL}/presets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preset_name: presetName.trim(),
          filters_json: JSON.stringify(filters),
        }),
      })
      setPresetName('')
      await fetchPresets()
    } catch {
      //silent
    } finally {
      setSavingPreset(false)
    }
  }

  const loadPreset = (preset) => {
    try {
      const parsed = JSON.parse(preset.filters_json)
      setFilters(parsed)
    } catch {
      // corrupt preset — ignore
    }
  }

  const overwritePreset = async (preset) => {
    try {
      await fetch(`${API_BASE_URL}/presets/${preset.preset_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preset_name: preset.preset_name,
          filters_json: JSON.stringify(filters),
        }),
      })
      await fetchPresets()
    } catch {
      //silent 
    }
  }

  const deletePreset = async (preset) => {
    try {
      await fetch(`${API_BASE_URL}/presets/${preset.preset_id}`, {
        method: 'DELETE',
      })
      await fetchPresets()
    } catch {
      //silent
    }
  }

  const updateFilters = (updates) => {
    setFilters((currentFilters) => ({
      ...currentFilters,
      ...updates,
    }))
  }

  return (
    <CSidebar
      className="border-end"
      colorScheme="dark"
      position="fixed"
      unfoldable={unfoldable}
      visible={sidebarShow}
      onVisibleChange={(visible) => {
        dispatch({ type: 'set', sidebarShow: visible })
      }}
    >
      <CSidebarHeader className="border-bottom py-1">
        <CSidebarBrand to="/" className="justify-content-center align-items-center px-0 py-0">
          <img
            src={teamBlueLogo}
            alt="Team Blue"
            style={{ maxHeight: '48px', width: 'auto', objectFit: 'contain', display: 'block' }}
          />
        </CSidebarBrand>
        <CCloseButton
          className="d-lg-none"
          dark
          onClick={() => dispatch({ type: 'set', sidebarShow: false })}
        />
      </CSidebarHeader>
      <CSidebarNav className="px-3 py-3">
        <CForm>
          <div className="mb-4">
            <CFormLabel className="fw-semibold mb-2">Airlines</CFormLabel>
            {airlineOptions.map((airline) => (
              <CFormCheck
                key={airline}
                id={`airline-${airline.toLowerCase()}`}
                label={airline}
                checked={filters.airlines.includes(airline)}
                onChange={() =>
                  updateFilters({
                    airlines: toggleValue(filters.airlines, airline),
                  })
                }
              />
            ))}
          </div>

          <div className="mb-4">
            <CFormLabel className="fw-semibold mb-2">Airports</CFormLabel>
            {airportOptions.map((airport) => (
              <CFormCheck
                key={airport}
                id={`airport-${airport.toLowerCase()}`}
                label={airport}
                checked={filters.airports.includes(airport)}
                onChange={() =>
                  updateFilters({
                    airports: toggleValue(filters.airports, airport),
                  })
                }
              />
            ))}
          </div>

          <div className="mb-4">
            <CFormLabel className="fw-semibold mb-2">Delay Types</CFormLabel>
            {delayTypeOptions.map((delayType) => (
              <CFormCheck
                key={delayType}
                id={`delay-${delayType.toLowerCase()}`}
                label={delayType}
                checked={filters.delay_types.includes(delayType)}
                onChange={() =>
                  updateFilters({
                    delay_types: toggleValue(filters.delay_types, delayType),
                  })
                }
              />
            ))}
          </div>

          <div className="mb-2">
            <CFormLabel className="fw-semibold mb-2">Date Range</CFormLabel>
            <CFormInput
              size="sm"
              type="date"
              value={filters.start_date}
              onChange={(event) => updateFilters({ start_date: event.target.value })}
            />
            <CFormInput
              size="sm"
              type="date"
              value={filters.end_date}
              onChange={(event) => updateFilters({ end_date: event.target.value })}
              className="mt-2"
            />
          </div>
        </CForm>

        <hr className="border-secondary my-3" />

        <div>
          <CFormLabel className="fw-semibold mb-2">Saved Presets</CFormLabel>
          <div className="d-flex gap-1 mb-2">
            <CFormInput
              size="sm"
              placeholder="Preset name"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && savePreset()}
            />
            <CButton
              color="primary"
              size="sm"
              disabled={!presetName.trim() || savingPreset}
              onClick={savePreset}
            >
              Save
            </CButton>
          </div>

          {presets.length > 0 && (
            <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
              {presets.map((preset) => (
                <div
                  key={preset.preset_id}
                  className="d-flex align-items-center justify-content-between py-1"
                >
                  <span
                    className="text-truncate small"
                    style={{ cursor: 'pointer', flex: 1 }}
                    title={`Load "${preset.preset_name}"`}
                    onClick={() => loadPreset(preset)}
                  >
                    {preset.preset_name}
                  </span>
                  <div className="d-flex gap-1 ms-1 flex-shrink-0">
                    <CButton
                      color="info"
                      variant="ghost"
                      size="sm"
                      title="Overwrite with current filters"
                      onClick={() => overwritePreset(preset)}
                      style={{ padding: '0 4px', lineHeight: 1 }}
                    >
                      ↻
                    </CButton>
                    <CButton
                      color="danger"
                      variant="ghost"
                      size="sm"
                      title="Delete preset"
                      onClick={() => deletePreset(preset)}
                      style={{ padding: '0 4px', lineHeight: 1 }}
                    >
                      ✕
                    </CButton>
                  </div>
                </div>
              ))}
            </div>
          )}

          {presets.length === 0 && (
            <div className="small text-medium-emphasis">No saved presets yet.</div>
          )}
        </div>
      </CSidebarNav>
    </CSidebar>
  )
}

export default React.memo(AppSidebar)
