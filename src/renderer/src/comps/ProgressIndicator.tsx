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

const ProgressIndicator = ({
  fileType,
  progress
}: {
  fileType: ext
  progress: number
}): React.ReactElement | null => {
  const { convertClicked } = useExplorer()
  const iconSize = 36 // Consistent size for both spinner and checkmark

  if (fileType === 'image') {
    return (
      <CenteredContainer>
        {!convertClicked ? (
          <div className="w-8 h-8 rounded-full border-2 border-white" />
        ) : progress >= 100 ? (
          <CheckOutlined style={{ fontSize: iconSize, color: '#52c41a' }} />
        ) : (
          <WhiteSpin indicator={<LoadingOutlined style={{ fontSize: iconSize }} spin />} />
        )}
      </CenteredContainer>
    )
  } else if (fileType === 'video' || fileType === 'audio') {
    // for audio and video
    return (
      <FullWidthProgress
        percent={convertClicked ? (progress >= 2 ? progress : 2) : 100}
        status={progress >= 100 ? 'success' : 'active'}
        showInfo={false}
      />
    )
  }
  return null // In case nothing fits
}

export default ProgressIndicator
