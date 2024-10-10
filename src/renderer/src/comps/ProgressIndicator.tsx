import { Progress, Spin } from 'antd'
import { CheckOutlined, LoadingOutlined } from '@ant-design/icons'
import styled from 'styled-components'
import { useExplorer } from '../ExplorerContext'
import { ext } from '../../../types'

const FullWidthProgress = styled(Progress)`
  .ant-progress-outer {
    width: 100% !important;
  }
  .ant-progress-bg {
    height: 24px !important;
  }
`

const WhiteSpin = styled(Spin)`
  .ant-spin-dot-item {
    background-color: white;
  }
`

const CenteredContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
`

const ProgressIndicator = ({ fileType, progress }: { fileType: ext; progress: number }) => {
  const { convertClicked } = useExplorer()
  const iconSize = 36 // Consistent size for both spinner and checkmark

  if (fileType === 'image') {
    return (
      <CenteredContainer>
        {progress >= 100 ? (
          <CheckOutlined style={{ fontSize: iconSize, color: '#52c41a' }} />
        ) : (
          convertClicked && ( // Removed extra curly braces
            <WhiteSpin indicator={<LoadingOutlined style={{ fontSize: iconSize }} spin />} />
          )
        )}
      </CenteredContainer>
    )
  } else {
    // for audio and video
    return (
      <FullWidthProgress
        percent={progress}
        status={progress >= 100 ? 'success' : 'active'}
        showInfo={false}
      />
    )
  }
}

export default ProgressIndicator
