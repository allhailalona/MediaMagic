import React from 'react'

export type DirItem = {
  path: string
  isExpanded?: boolean
  name: string
  type: 'file' | 'folder'
  ext?: ext
  size: string
  duration?: string
  children?: (DirItem | null)[] | undefined
  progress?: number
}

export type ExplorerContextType = {
  explorer: DirItem[]
  setExplorer: React.Dispatch<React.SetStateAction<DirItem[]>>
  convertClicked: boolean
  setConvertClicked: React.Dispatch<React.SetStateAction<boolean>>
  expandFolder: (index: number, depth: number) => void
  deleteItem: (index: number, depth: number) => void
}

export type ext = 'video' | 'audio' | 'image' | null
