import { notification } from 'antd'
import { InfoCircleOutlined, CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons'

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

export const showConversionErrorNotification = (filename: string, errorMessage: string): void => {
  notification.error({
    message: 'Conversion aa Error',
    description: `Error with file '${filename}': ${errorMessage}. Please hold while FFMPEG stops completely`,
    icon: <CloseCircleOutlined style={{ color: '#ff4d4f' }} />,
    placement: 'topRight',
    duration: 30
  })
}

export const showEmptyFolderNotification = (): void => {
  notification.info({
    message: 'Empty Folder',
    description: 'This folder does not contain any items.',
    icon: <InfoCircleOutlined style={{ color: '#1890ff' }} />,
    placement: 'topRight',
    duration: 10
  })
}
