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

import React from 'react'
import { useSelector, useDispatch } from 'react-redux'

import {
  CCloseButton,
  CForm,
  CFormCheck,
  CFormInput,
  CFormLabel,
  CSidebar,
  CSidebarBrand,
  CSidebarFooter,
  CSidebarHeader,
  CSidebarNav,
  CSidebarToggler,
} from '@coreui/react'
import CIcon from '@coreui/icons-react'

import { logo } from 'src/assets/brand/logo'
import { sygnet } from 'src/assets/brand/sygnet'

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
      <CSidebarHeader className="border-bottom">
        <CSidebarBrand to="/">
          <CIcon customClassName="sidebar-brand-full" icon={logo} height={32} />
          <CIcon customClassName="sidebar-brand-narrow" icon={sygnet} height={32} />
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
            <CFormCheck id="airline-delta" label="Delta" defaultChecked />
            <CFormCheck id="airline-united" label="United" defaultChecked />
            <CFormCheck id="airline-southwest" label="Southwest" defaultChecked />
            <CFormCheck id="airline-american" label="American" />
            <CFormCheck id="airline-jetblue" label="JetBlue" />
          </div>

          <div className="mb-4">
            <CFormLabel className="fw-semibold mb-2">Airports</CFormLabel>
            <CFormCheck id="airport-atl" label="ATL" defaultChecked />
            <CFormCheck id="airport-ord" label="ORD" defaultChecked />
            <CFormCheck id="airport-den" label="DEN" />
            <CFormCheck id="airport-lax" label="LAX" />
            <CFormCheck id="airport-jfk" label="JFK" />
          </div>

          <div className="mb-4">
            <CFormLabel className="fw-semibold mb-2">Delay Types</CFormLabel>
            <CFormCheck id="delay-weather" label="Weather" defaultChecked />
            <CFormCheck id="delay-aircraft" label="Aircraft" defaultChecked />
            <CFormCheck id="delay-carrier" label="Carrier" />
            <CFormCheck id="delay-nas" label="NAS" />
            <CFormCheck id="delay-security" label="Security" />
          </div>

          <div className="mb-2">
            <CFormLabel className="fw-semibold mb-2">Date Range</CFormLabel>
            <CFormInput size="sm" type="text" placeholder="Start date (placeholder)" disabled />
            <CFormInput
              size="sm"
              type="text"
              className="mt-2"
              placeholder="End date (placeholder)"
              disabled
            />
          </div>
        </CForm>
      </CSidebarNav>
      <CSidebarFooter className="border-top d-none d-lg-flex">
        <CSidebarToggler
          onClick={() => dispatch({ type: 'set', sidebarUnfoldable: !unfoldable })}
        />
      </CSidebarFooter>
    </CSidebar>
  )
}

export default React.memo(AppSidebar)
