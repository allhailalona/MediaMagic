import { notification } from 'antd'
import { InfoCircleOutlined, CheckCircleOutlined } from '@ant-design/icons'

// Config 'no selected files' notification
export const showSelectedFilesNotification = (): void => {
  notification.info({
    message: 'No Content Loaded',
    description:
      'Please load content using one of the methods above, then pick an output directory!',
    icon: <InfoCircleOutlined style={{ color: '#1890ff' }} />,
    placement: 'topRight',
    duration: 3
  })
}

export const showConversionSuccessNotification = (): void => {
  notification.success({
    message: 'Conversion Completed',
    description: 'Conversion completed successfully. You can now clear all files.',
    icon: <CheckCircleOutlined style={{ color: '#52c41a' }} />,
    placement: 'topRight',
    duration: 5
  })
}

export const showConversionStoppedNotification = (): void => {
  notification.info({
    message: 'Stopping Conversion',
    description: 'Hold tight, this may take some time',
    icon: <InfoCircleOutlined style={{ color: '#1890ff' }} />,
    placement: 'topRight',
    duration: 3
  })
}
