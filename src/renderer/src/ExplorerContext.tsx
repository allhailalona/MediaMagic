import React, { createContext, useState, useContext } from 'react'
import { DirItem, ExplorerContextType } from '../../types'
import { notification } from 'antd'
import { InfoCircleOutlined } from '@ant-design/icons'

const ExplorerContext = createContext<ExplorerContextType | undefined>(undefined)

export const ExplorerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [explorer, setExplorer] = useState<DirItem[]>([])
  const [convertClicked, setConvertClicked] = useState<boolean>(false)

  // Config 'no children' notification
  const showEmptyFolderNotification = (): void => {
    notification.info({
      message: 'Empty Folder',
      description: 'This folder does not contain any items.',
      icon: <InfoCircleOutlined style={{ color: '#1890ff' }} />,
      placement: 'topRight',
      duration: 10
    })
  }

  // Function to recursively collapse all subfolders and handle null values
  const collapseAll = (items: (DirItem | null)[] | undefined): (DirItem | null)[] | undefined => {
    // Map through each item in the array
    return items.map((item) => {
      // Return a new object with collapsed state
      return {
        ...item, // Spread all properties of the original item
        isExpanded: false, // Set expanded state to false
        children: item.children ? collapseAll(item.children) : undefined
        // Recursively collapse children if they exist, otherwise set to undefined
      }
    })
  }

  // Function to expand or collapse a folder at a specific index and depth
  const expandFolder = (index: number, depth: number): void => {
    // Update the explorer state
    setExplorer((prevExplorer: DirItem[]) => {
      // Helper function to recursively update the explorer structure
      const updateExplorer = (
        items: (DirItem | null)[],
        currentDepth: number
      ): (DirItem | null)[] => {
        return items.map((item, i) => {
          // Check if this is the item we want to expand/collapse
          if (i === index && currentDepth === depth) {
            // If item has no children or empty children array, show notification and don't toggle
            if (!item.children || item.children.length === 0) {
              showEmptyFolderNotification()
              return item
            }

            // Toggle the expanded state
            const newIsExpanded = !item.isExpanded

            // Return the updated item
            return {
              ...item,
              isExpanded: newIsExpanded,
              children: newIsExpanded
                ? item.children // If expanding, keep children as is
                : collapseAll(item.children) // If collapsing, collapse all subfolders
            }
          }

          // If item has children, recursively update them
          if (item.children) {
            return {
              ...item,
              children: updateExplorer(item.children, currentDepth + 1)
            }
          }

          // If not the target item and no children, return the item as is
          return item
        })
      }

      // Start the update process from the top level
      return updateExplorer(prevExplorer, 0)
    })
  }

  const deleteItem = (index: number, depth: number): void => {
    setExplorer((prevExplorer) => {
      // Recursive function to update the explorer structure
      const updateExplorer = (items: DirItem[], currentDepth: number): DirItem[] => {
        return items.filter((item, i) => {
          // If this is the item to delete, remove it by returning false
          if (i === index && currentDepth === depth) {
            return false
          }
          // If item has children, recursively update them
          if (item.children) {
            item.children = updateExplorer(item.children, currentDepth + 1)
          }
          // Keep all other items
          return true
        })
      }

      // Start the update process from the top level
      return updateExplorer(prevExplorer, 0)
    })
  }

  return (
    <ExplorerContext.Provider
      value={{ explorer, setExplorer, convertClicked, setConvertClicked, expandFolder, deleteItem }}
    >
      {children}
    </ExplorerContext.Provider>
  )
}

export const useExplorer = (): ExplorerContextType => {
  const context = useContext(ExplorerContext)
  if (!context) {
    throw new Error('useExplorer must be used within a ExplorerProvider')
  }
  return context
}
