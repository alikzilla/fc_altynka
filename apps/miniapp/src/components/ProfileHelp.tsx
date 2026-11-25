import { useState } from 'react';
import { openLink } from '../lib/tg';
import { versionLabel } from '../lib/version';
import { DeleteMyDataSheet } from './DeleteMyData';
import { Icon } from './Icon';
import { ReportProblemSheet } from './ReportProblem';

/**
 * Конец профиля: «Помощь и данные» в формате «Настройки профиля» (иконка, текст, шеврон), затем отдельной красной
 * карточкой того же формата — «Удалить мои данные», и версия сборки последней строкой.
 */
export function ProfileHelp() {
  const [reporting, setReporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  return <>
    <h2 className="section" id="profile-help">Помощь и данные</h2>
    <nav className="profile-management" aria-labelledby="profile-help">
      <button type="button" className="card task-preview material-graphite" onClick={() => setReporting(true)}>
        <span className="task-icon"><Icon name="chat" /></span>
        <span className="task-copy"><b>Сообщить о проблеме</b><small>Ошибка или неудобство</small></span>
        <Icon name="back" className="chevron-right" />
      </button>
      <button type="button" className="card task-preview material-graphite" onClick={() => openLink(`${location.origin}/privacy`)}>
        <span className="task-icon"><Icon name="shield" /></span>
        <span className="task-copy"><b>Политика конфиденциальности</b><small>Что храним и кто это видит</small></span>
        <Icon name="external" className="profile-external" />
      </button>
    </nav>
    <button type="button" className="card task-preview material-danger profile-delete" onClick={() => setDeleting(true)}>
      <span className="task-icon"><Icon name="trash" /></span>
      <span className="task-copy"><b>Удалить мои данные</b><small>Профиль, анкета и настройки</small></span>
      <Icon name="back" className="chevron-right" />
    </button>
    <p className="profile-version muted">Версия {versionLabel()}</p>
    {reporting && <ReportProblemSheet onClose={() => setReporting(false)} />}
    {deleting && <DeleteMyDataSheet onClose={() => setDeleting(false)} />}
  </>;
}
