import { open } from '@tauri-apps/plugin-dialog'

interface Props {
  folder: string | null
  photoCount: number
  onPick: (folder: string) => void
}

export function FolderPicker({ folder, photoCount, onPick }: Props) {
  async function handleClick() {
    const selected = await open({ directory: true, multiple: false, title: 'Select photo folder' })
    if (typeof selected === 'string' && selected) {
      onPick(selected)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <button onClick={handleClick}>
        {folder ? 'Change folder' : 'Select photo folder'}
      </button>
      {folder && (
        <span style={{ fontSize: 13, color: '#aaa' }}>
          {folder} &mdash; {photoCount} photo{photoCount !== 1 ? 's' : ''}
        </span>
      )}
    </div>
  )
}
