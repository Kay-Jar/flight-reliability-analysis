import React from 'react'
import { CFooter } from '@coreui/react'

const AppFooter = () => {
  return (
    <CFooter className="px-4 justify-content-center">
      <span>Team Blue</span>
    </CFooter>
  )
}

export default React.memo(AppFooter)
