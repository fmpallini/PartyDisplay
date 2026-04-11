import { open } from '@tauri-apps/plugin-dialog'

interface Props {
  folder:       string | null
  photoCount:   number
  onPick:       (folder: string) => void
  itemLabel?:   string   // default: 'photo'
  dialogTitle?: string   // default: 'Select photo folder'
}

export function FolderPicker({ folder, photoCount, onPick, itemLabel = 'photo', dialogTitle = 'Select photo folder' }: Props) {
  async function handleClick() {
    const selected = await open({ directory: true, multiple: false, title: dialogTitle })
    if (typeof selected === 'string' && selected) onPick(selected)
  }

  // Show only last 2 path segments so the path doesn't overflow
  const shortPath = folder
    ? folder.replace(/\\/g, '/').split('/').slice(-2).join('/')
    : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={handleClick} style={btnStyle}>
          {folder ? 'Change folder' : 'Select folder'}
        </button>
        {folder && (
          <span style={{ color: '#1db954', fontWeight: 600, fontSize: 12 }}>
            {photoCount} {itemLabel}{photoCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>
      {folder ? (
        <div title={folder} style={{ fontSize: 11, color: '#555', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          …/{shortPath}
        </div>
      ) : (
        <div style={{ fontSize: 11, color: '#444' }}>No folder selected</div>
      )}
    </div>
  )
}

const btnStyle: React.CSSProperties = {
  background: '#242424',
  border: '1px solid #333',
  color: '#e8e8e8',
  borderRadius: 5,
  padding: '5px 12px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 12,
  fontWeight: 500,
}
