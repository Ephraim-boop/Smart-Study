import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BookOpenIcon,
  DownloadIcon,
  FileTextIcon,
  ImageIcon,
  ListIcon,
  PlusIcon,
  RefreshIcon,
  SaveIcon,
  TrashIcon,
  UploadIcon,
  XIcon,
} from '../components/icons';
import { useAuth } from '../auth/AuthProvider';
import { useI18n } from '../i18n/LanguageProvider';
import { extractNoteText } from '../summarize/lib/extractText';
import { guessMime, validateNoteFile, type UploadedNote } from '../upload/types';
import { CameraCapture } from '../upload/CameraCapture';
import {
  AssignmentError,
  sendAssignmentChat,
  type AssignmentChatMessage,
  type AssignmentChatMode,
  type AssignmentImage,
} from './assignmentApi';
import {
  ASSIGNMENT_CHAT_LOCAL_ONLY_NOTICE,
  deleteAssignmentChat,
  loadAssignmentChats,
  readLocalAssignmentChats,
  saveAssignmentChats,
  type ChatMessage,
  type Conversation,
} from './assignmentChatStorage';

type RetryRequest = {
  conversationId: string;
  messageId: string;
  messages: AssignmentChatMessage[];
  mode: AssignmentChatMode;
  images: AssignmentImage[];
};

const MAX_IMAGE_BYTES = 2_500_000;
const MAX_IMAGE_COUNT = 4;
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const MODES: { value: AssignmentChatMode; label: string }[] = [
  { value: 'standard', label: 'Answer normally' },
  { value: 'step_by_step', label: 'Step-by-step solution' },
  { value: 'simple', label: 'Simple explanation' },
  { value: 'detailed', label: 'Detailed explanation' },
  { value: 'final_answer', label: 'Final answer only' },
  { value: 'check_answer', label: 'Check my answer' },
  { value: 'examples', label: 'Give me examples' },
];

function isAssignmentImage(file: File): boolean {
  return file.type.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(file.name);
}

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function newConversation(title = 'New chat'): Conversation {
  const now = Date.now();
  return { id: makeId(), title, updatedAt: now, messages: [] };
}

function conversationTitle(text: string, fallback = 'New chat'): string {
  const firstLine = text.replace(/\s+/g, ' ').trim();
  return firstLine.length > 44 ? `${firstLine.slice(0, 41).trim()}...` : firstLine || fallback;
}

function formatConversationDate(timestamp: number): string {
  const today = new Date();
  const date = new Date(timestamp);
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function readDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Could not read the image.'));
    reader.onerror = () => reject(new Error('Could not read the image.'));
    reader.readAsDataURL(file);
  });
}

async function prepareImage(file: File): Promise<AssignmentImage> {
  const fileType = guessMime(file.name, file.type);
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(fileType)) {
    throw new Error(`${file.name}: Use a JPG, PNG, or WEBP image.`);
  }
  let imageBlob: Blob = file;
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file);
    try {
      const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('This browser could not process the image.');
      context.fillStyle = '#fff';
      context.fillRect(0, 0, width, height);
      context.drawImage(bitmap, 0, 0, width, height);
      imageBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) => blob ? resolve(blob) : reject(new Error('Could not prepare the image.')),
          fileType === 'image/png' ? 'image/png' : 'image/jpeg',
          0.92,
        );
      });
    } finally {
      bitmap.close();
    }
  }
  if (imageBlob.size > MAX_IMAGE_BYTES) {
    throw new Error(`${file.name}: The processed image is too large. Crop or resize it and try again.`);
  }
  const dataUrl = await readDataUrl(imageBlob);
  const comma = dataUrl.indexOf(',');
  if (comma < 0) throw new Error(`${file.name}: Could not prepare the image.`);
  return { mimeType: imageBlob.type || fileType, data: dataUrl.slice(comma + 1) };
}

async function renderPdfPages(file: File, maxPages = MAX_IMAGE_COUNT): Promise<{ images: AssignmentImage[]; totalPages: number }> {
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const totalPages = pdf.numPages;
  const images: AssignmentImage[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= Math.min(totalPages, maxPages); pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const initialViewport = page.getViewport({ scale: 1 });
      const scale = Math.min(1.4, 1500 / Math.max(initialViewport.width, initialViewport.height));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('This browser could not render the scanned PDF.');
      await page.render({ canvasContext: context, viewport }).promise;
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.84));
      canvas.width = 0;
      canvas.height = 0;
      if (!blob) throw new Error('Could not render a page from the scanned PDF.');
      const dataUrl = await readDataUrl(blob);
      images.push({ mimeType: 'image/jpeg', data: dataUrl.slice(dataUrl.indexOf(',') + 1) });
    }
  } finally {
    await pdf.destroy();
  }
  return { images, totalPages };
}

async function downloadConversationPdf(title: string, messages: ChatMessage[]): Promise<void> {
  const { default: jspdfBundle } = await import('jspdf/dist/jspdf.umd.min.js');
  const { jsPDF } = jspdfBundle;
  const document = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = document.internal.pageSize.getWidth();
  const pageHeight = document.internal.pageSize.getHeight();
  const margin = 18;
  const footerSpace = 16;
  const contentWidth = pageWidth - margin * 2;
  let y = margin;

  document.setProperties({ title, subject: 'StudySmart assignment conversation' });
  document.setFont('helvetica', 'bold');
  document.setFontSize(18);
  const titleLines = document.splitTextToSize(title, contentWidth);
  document.text(titleLines, margin, y);
  y += titleLines.length * 8 + 4;

  document.setFont('helvetica', 'normal');
  document.setFontSize(9);
  document.setTextColor(100);
  document.text(`StudySmart • ${new Date().toLocaleDateString()}`, margin, y);
  y += 8;
  document.setDrawColor(210, 220, 235);
  document.line(margin, y, pageWidth - margin, y);
  y += 8;

  messages.forEach((message) => {
    if (y + 12 > pageHeight - footerSpace) {
      document.addPage();
      y = margin;
    }

    document.setFont('helvetica', 'bold');
    document.setFontSize(11);
    document.setTextColor(message.role === 'assistant' ? 23 : 55, message.role === 'assistant' ? 59 : 65, message.role === 'assistant' ? 119 : 81);
    document.text(message.role === 'assistant' ? 'StudySmart' : 'You', margin, y);
    y += 6;

    document.setFont('helvetica', 'normal');
    document.setFontSize(10);
    document.setTextColor(45);
    const lines = document.splitTextToSize(message.content, contentWidth);
    lines.forEach((line: string) => {
      if (y + 5 > pageHeight - footerSpace) {
        document.addPage();
        y = margin;
      }
      document.text(line, margin, y);
      y += 5;
    });
    y += 5;
  });

  const pageCount = document.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    document.setPage(page);
    document.setFont('helvetica', 'normal');
    document.setFontSize(8);
    document.setTextColor(125);
    document.text(`Page ${page} of ${pageCount}`, pageWidth - margin, pageHeight - 8, { align: 'right' });
  }

  const filename = title.replace(/[^a-z0-9-_ ]/gi, '').trim() || 'assignment-chat';
  document.save(`${filename}.pdf`);
}

export function AssignmentSolverPage({ onBack }: { onBack: () => void }) {
  const { user } = useAuth();
  const { language, t } = useI18n();
  const accountId = user?.id ?? 'guest';
  const [chats, setChats] = useState<Conversation[]>(() => readLocalAssignmentChats(accountId));
  const [activeChatId, setActiveChatId] = useState(() => readLocalAssignmentChats(accountId)[0]?.id ?? '');
  const [draft, setDraft] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [mode, setMode] = useState<AssignmentChatMode>('standard');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [storageError, setStorageError] = useState('');
  const [historyReady, setHistoryReady] = useState(false);
  const [retryRequest, setRetryRequest] = useState<RetryRequest | null>(null);
  const [imageDataByMessage, setImageDataByMessage] = useState<Record<string, AssignmentImage[]>>({});
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const activeChat = chats.find((chat) => chat.id === activeChatId) ?? null;
  const messages = activeChat?.messages ?? [];
  const visibleStorageError = storageError === ASSIGNMENT_CHAT_LOCAL_ONLY_NOTICE ? '' : storageError;

  useEffect(() => {
    let active = true;
    setHistoryReady(false);
    void loadAssignmentChats(accountId).then((history) => {
      if (!active) return;
      setChats(history.chats);
      setActiveChatId(history.chats[0]?.id ?? '');
      setStorageError(history.notice ?? '');
      setHistoryReady(true);
    });
    return () => { active = false; };
  }, [accountId]);

  useEffect(() => {
    if (!historyReady) return;
    const timer = window.setTimeout(() => {
      void saveAssignmentChats(accountId, chats).then((outcome) => {
        setStorageError(outcome.notice ?? '');
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [accountId, chats, historyReady]);

  useEffect(() => {
    if (messages.length > 0) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, activeChatId, busy]);

  const createChat = () => {
    if (!historyReady) return;
    const chat = newConversation(t('assignment.newChat'));
    setChats((current) => [chat, ...current].slice(0, 20));
    setActiveChatId(chat.id);
    setDraft('');
    setSelectedFiles([]);
    setError('');
    setRetryRequest(null);
    setSidebarOpen(false);
  };

  const updateChat = (chatId: string, update: (chat: Conversation) => Conversation) => {
    setChats((current) => current.map((chat) => chat.id === chatId ? update(chat) : chat));
  };

  const selectChat = (chatId: string) => {
    if (!historyReady) return;
    setActiveChatId(chatId);
    setDraft('');
    setSelectedFiles([]);
    setError('');
    setRetryRequest(null);
    setSidebarOpen(false);
  };

  const addFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const incoming = Array.from(event.target.files ?? []);
    const accepted = incoming.filter((file) =>
      validateNoteFile(file).ok && (!isAssignmentImage(file) || ['image/jpeg', 'image/png', 'image/webp'].includes(guessMime(file.name, file.type))),
    );
    const rejected = incoming.filter((file) => !accepted.includes(file));
    const next = [...selectedFiles, ...accepted];
    if (next.length > 8) {
      setError('Attach up to eight files to a message.');
      event.target.value = '';
      return;
    }
    const totalImages = next.filter(isAssignmentImage).length;
    if (totalImages > MAX_IMAGE_COUNT) {
      setError(`Attach up to ${MAX_IMAGE_COUNT} photos or screenshots to a message.`);
      event.target.value = '';
      return;
    }
    setSelectedFiles(next);
    setError(rejected.map((file) => {
      const validation = validateNoteFile(file);
      return `${file.name}: ${validation.reason || 'Use a PDF, DOCX, TXT, Markdown, JPG, PNG, or WEBP file.'}`;
    }).join(' '));
    event.target.value = '';
  };

  const submit = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (busy) return;
    if (!historyReady) {
      setError('Loading your private chat history. Please wait a moment.');
      return;
    }
    setError('');

    const text = draft.trim();
    if (!text && selectedFiles.length === 0) return;
    setRetryRequest(null);
    const chat = activeChat ?? newConversation();
    const chatId = chat.id;
    const priorMessages = chat.messages;
    let contextParts: string[] = [];
    const images: AssignmentImage[] = [];
    const attachmentNames = selectedFiles.map((file) => file.name);
    let remainingPdfVisualPages = Math.max(0, MAX_IMAGE_COUNT - selectedFiles.filter(isAssignmentImage).length);
    const warnings: string[] = [];
    setBusy(true);

    try {
      for (const [index, file] of selectedFiles.entries()) {
        if (isAssignmentImage(file)) {
          images.push(await prepareImage(file));
          continue;
        }
        const note: UploadedNote = {
          id: `assignment-${makeId()}-${index}`,
          file,
          name: file.name,
          size: file.size,
          mime: file.type,
          source: file.name.toLowerCase().endsWith('.pdf') ? 'pdf' : 'photo',
          previewUrl: null,
          addedAt: Date.now(),
        };
        const extracted = await extractNoteText(note);
        if (extracted.ok) {
          contextParts.push(`--- Extracted from ${file.name} ---\n${extracted.text}`);
          if (extracted.truncated) warnings.push(`${file.name} is long; only the beginning was included.`);
          if (file.name.toLowerCase().endsWith('.pdf')) {
            if (remainingPdfVisualPages === 0) {
              warnings.push(`${file.name}: PDF page images were skipped because this message already uses the image limit.`);
            } else {
              try {
                const rendered = await renderPdfPages(file, remainingPdfVisualPages);
                images.push(...rendered.images);
                remainingPdfVisualPages -= rendered.images.length;
                if (rendered.images.length > 0) {
                  contextParts.push(`Visual reference: the first ${rendered.images.length} page(s) of ${file.name} are attached for diagrams and layout. Selectable text was extracted from the document.`);
                }
                if (rendered.totalPages > rendered.images.length && rendered.totalPages > 0) {
                  warnings.push(`${file.name}: visual references include the first ${rendered.images.length} of ${rendered.totalPages} pages.`);
                }
              } catch {
                warnings.push(`${file.name}: selectable text was extracted, but its diagrams could not be prepared as images.`);
              }
            }
          }
        } else if (file.name.toLowerCase().endsWith('.pdf')) {
          if (remainingPdfVisualPages === 0) {
            warnings.push(`${file.name} is scanned and no image slots remain to read its pages.`);
          } else {
            try {
              const rendered = await renderPdfPages(file, remainingPdfVisualPages);
              images.push(...rendered.images);
              remainingPdfVisualPages -= rendered.images.length;
              if (rendered.images.length > 0) {
                contextParts.push(`The uploaded PDF "${file.name}" had no selectable text. Read the attached rendered pages. Only the first ${rendered.images.length} of ${rendered.totalPages} pages are attached.`);
                warnings.push(`${file.name} was scanned; the first ${rendered.images.length} pages were sent as images.`);
              }
            } catch {
              warnings.push(extracted.reason);
            }
          }
        } else {
          warnings.push(extracted.reason);
        }
      }

      const totalImageBytes = images.reduce((sum, image) => sum + Math.floor(image.data.length * 3 / 4), 0);
      if (images.length > MAX_IMAGE_COUNT || totalImageBytes > MAX_IMAGE_BYTES) {
        throw new Error('The combined image attachments are too large. Remove a page or image and try again.');
      }
      if (!text && contextParts.length === 0 && images.length === 0) {
        throw new Error(warnings.join(' ') || 'Add readable assignment text or an image before sending.');
      }

      const prompt = text || 'Please read the attached assignment, identify its subject and questions, and solve it. If there are multiple questions, organize the answers by question number.';
      const content = [prompt, ...contextParts, ...(attachmentNames.length ? [`Attached files: ${attachmentNames.join(', ')}`] : [])].join('\n\n');
      const userMessage: ChatMessage = {
        id: makeId(),
        role: 'user',
        content,
        createdAt: Date.now(),
        mode,
        attachments: attachmentNames,
      };
      const history = [...priorMessages, userMessage];
      const apiMessages = history.slice(-30).map(({ role, content: messageContent }) => ({ role, content: messageContent }));
      setChats((current) => {
        const found = current.some((item) => item.id === chatId);
        const nextChat = {
          ...chat,
          title: chat.messages.length === 0 ? conversationTitle(text || attachmentNames[0], t('assignment.newChat')) : chat.title,
          updatedAt: Date.now(),
          messages: history.slice(-40),
        };
        return found
          ? [nextChat, ...current.filter((item) => item.id !== chatId)].slice(0, 20)
          : [nextChat, ...current].slice(0, 20);
      });
      setActiveChatId(chatId);
      setDraft('');
      setSelectedFiles([]);
      setRetryRequest({
        conversationId: chatId,
        messageId: userMessage.id,
        messages: apiMessages,
        mode,
        images,
      });
      setImageDataByMessage((current) => ({ ...current, [userMessage.id]: images }));

      const answer = await sendAssignmentChat(apiMessages, mode, images, language);
      const assistantMessage: ChatMessage = { id: makeId(), role: 'assistant', content: answer, createdAt: Date.now() };
      updateChat(chatId, (current) => ({
        ...current,
        updatedAt: Date.now(),
        messages: [...current.messages, assistantMessage].slice(-40),
      }));
      setRetryRequest(null);
      if (warnings.length) setError(warnings.join(' '));
    } catch (sendError) {
      setError(sendError instanceof AssignmentError || sendError instanceof Error
        ? sendError.message
        : 'The AI could not answer right now. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const retry = async () => {
    if (!retryRequest || busy) return;
    setBusy(true);
    setError('');
    try {
      const answer = await sendAssignmentChat(retryRequest.messages, retryRequest.mode, retryRequest.images, language);
      const assistantMessage: ChatMessage = { id: makeId(), role: 'assistant', content: answer, createdAt: Date.now() };
      updateChat(retryRequest.conversationId, (chat) => ({
        ...chat,
        updatedAt: Date.now(),
        messages: [...chat.messages, assistantMessage].slice(-40),
      }));
      setRetryRequest(null);
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : 'The AI could not answer right now. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const regenerate = async (messageIndex: number) => {
    if (!activeChat || busy) return;
    const target = activeChat.messages[messageIndex];
    if (!target || target.role !== 'assistant') return;
    let userIndex = messageIndex - 1;
    while (userIndex >= 0 && activeChat.messages[userIndex].role !== 'user') userIndex -= 1;
    if (userIndex < 0) return;

    const userMessage = activeChat.messages[userIndex];
    const apiMessages = activeChat.messages.slice(0, userIndex + 1).slice(-30)
      .map(({ role, content }) => ({ role, content }));
    const request: RetryRequest = {
      conversationId: activeChat.id,
      messageId: userMessage.id,
      messages: apiMessages,
      mode: userMessage.mode ?? 'standard',
      images: imageDataByMessage[userMessage.id] ?? [],
    };
    setRetryRequest(request);
    setBusy(true);
    setError('');
    updateChat(activeChat.id, (chat) => ({ ...chat, messages: chat.messages.slice(0, messageIndex) }));
    try {
      const answer = await sendAssignmentChat(request.messages, request.mode, request.images, language);
      updateChat(activeChat.id, (chat) => ({
        ...chat,
        updatedAt: Date.now(),
        messages: [...chat.messages, { id: makeId(), role: 'assistant', content: answer, createdAt: Date.now() }],
      }));
      setRetryRequest(null);
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : 'The answer could not be regenerated.');
    } finally {
      setBusy(false);
    }
  };

  const toggleSavedAnswer = (messageId: string) => {
    if (!activeChat) return;
    updateChat(activeChat.id, (chat) => ({
      ...chat,
      messages: chat.messages.map((message) => message.id === messageId ? { ...message, saved: !message.saved } : message),
    }));
  };

  const copyAnswer = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setError('');
    } catch {
      setError('Copy was blocked by the browser. Select the answer text and copy it manually.');
    }
  };

  const renameChat = (chat: Conversation) => {
    const title = window.prompt('Rename conversation', chat.title);
    if (!title?.trim()) return;
    updateChat(chat.id, (current) => ({ ...current, title: title.trim().slice(0, 80) }));
  };

  const deleteChat = (chat: Conversation) => {
    if (!window.confirm(`Delete "${chat.title}" and its messages? This cannot be undone.`)) return;
    const remaining = chats.filter((item) => item.id !== chat.id);
    setChats(remaining);
    void deleteAssignmentChat(accountId, chat.id).then((outcome) => {
      if (outcome.notice) setStorageError(outcome.notice);
    });
    setImageDataByMessage((current) => {
      const next = { ...current };
      chat.messages.forEach((message) => delete next[message.id]);
      return next;
    });
    if (activeChatId === chat.id) {
      setActiveChatId(remaining[0]?.id ?? '');
      setDraft('');
      setSelectedFiles([]);
      setError('');
      setRetryRequest(null);
    }
  };

  const clearConversation = () => {
    if (!activeChat || activeChat.messages.length === 0) return;
    if (!window.confirm('Clear all messages in this conversation?')) return;
    setImageDataByMessage((current) => {
      const next = { ...current };
      activeChat.messages.forEach((message) => delete next[message.id]);
      return next;
    });
    updateChat(activeChat.id, (chat) => ({ ...chat, title: t('assignment.newChat'), updatedAt: Date.now(), messages: [] }));
    setError('');
    setRetryRequest(null);
  };

  const downloadConversation = async () => {
    if (!activeChat) return;
    setError('');
    try {
      await downloadConversationPdf(activeChat.title, activeChat.messages);
    } catch {
      setError('The PDF could not be generated. Please try again.');
    }
  };

  const answerCount = useMemo(() => messages.filter((message) => message.role === 'assistant').length, [messages]);
  const modeLabels: Record<AssignmentChatMode, string> = {
    standard: t('assignment.modes.standard'),
    step_by_step: t('assignment.modes.stepByStep'),
    simple: t('assignment.modes.simple'),
    detailed: t('assignment.modes.detailed'),
    final_answer: t('assignment.modes.finalAnswer'),
    check_answer: t('assignment.modes.checkAnswer'),
    examples: t('assignment.modes.examples'),
  };
  const modeName = modeLabels[mode];

  return (
    <div className="flex h-[100svh] h-[100dvh] min-h-0 flex-col overflow-hidden bg-slate-50 text-slate-800 lg:flex-row">
      {sidebarOpen && (
        <button type="button" aria-label={t('assignment.closeHistory')} onClick={() => setSidebarOpen(false)} className="fixed inset-0 z-30 bg-slate-950/40 lg:hidden" />
      )}
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[min(290px,85vw)] shrink-0 flex-col border-r border-slate-200 bg-[#f7f9fc] p-4 transition-transform lg:static lg:w-[290px] lg:z-auto lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-semibold text-slate-900">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-700 text-white"><BookOpenIcon width={18} height={18} /></span>
            <span>StudySmart <span className="font-normal text-slate-500">Tutor</span></span>
          </div>
          <button type="button" onClick={() => setSidebarOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-200 lg:hidden" aria-label={t('assignment.closeSidebar')}><XIcon width={18} height={18} /></button>
        </div>

        <button type="button" disabled={!historyReady} onClick={createChat} className="mt-6 flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-left text-sm font-semibold text-slate-800 shadow-sm transition hover:border-blue-300 hover:bg-blue-50 disabled:cursor-wait disabled:opacity-60">
          <PlusIcon width={18} height={18} /> {t('assignment.newChat')}
        </button>

        <div className="mt-7 flex items-center justify-between px-2">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{t('assignment.yourHistory')}</p>
          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] text-slate-600">{chats.filter((chat) => chat.messages.length > 0).length}</span>
        </div>
        <div className="mt-2 flex-1 space-y-1 overflow-y-auto">
          {chats.filter((chat) => chat.messages.length > 0).map((chat) => (
            <div key={chat.id} className={`group flex items-center rounded-xl px-2 ${activeChatId === chat.id ? 'bg-blue-100 text-blue-900' : 'text-slate-600 hover:bg-white'}`}>
              <button type="button" disabled={!historyReady} onClick={() => selectChat(chat.id)} className="min-w-0 flex-1 py-2.5 text-left disabled:cursor-wait">
                <span className="block truncate text-sm font-medium">{chat.title}</span>
                <span className="mt-0.5 block text-[11px] text-slate-400">{formatConversationDate(chat.updatedAt)}</span>
              </button>
              <button type="button" disabled={!historyReady} onClick={() => renameChat(chat)} className="rounded-lg p-1.5 text-slate-400 opacity-0 hover:bg-white hover:text-blue-700 focus:opacity-100 group-hover:opacity-100 disabled:cursor-wait" aria-label={`Rename ${chat.title}`} title="Rename"><FileTextIcon width={14} height={14} /></button>
              <button type="button" disabled={!historyReady} onClick={() => deleteChat(chat)} className="rounded-lg p-1.5 text-slate-400 opacity-0 hover:bg-white hover:text-red-600 focus:opacity-100 group-hover:opacity-100 disabled:cursor-wait" aria-label={`Delete ${chat.title}`} title="Delete"><TrashIcon width={14} height={14} /></button>
            </div>
          ))}
          {chats.every((chat) => chat.messages.length === 0) && (
            <p className="px-2 py-4 text-sm leading-6 text-slate-400">{t('assignment.historyHint')}</p>
          )}
        </div>
        <div className="mt-4 border-t border-slate-200 pt-4">
          <button type="button" onClick={onBack} className="flex w-full items-center gap-3 rounded-xl bg-blue-600 px-3 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700">
            <ArrowLeftIcon width={17} height={17} /> {t('assignment.backToDashboard')}
          </button>
          <p className="mt-2 truncate px-3 text-xs text-slate-400">{user?.email ?? t('assignment.privateHistory')}</p>
        </div>
      </aside>

      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex min-h-[68px] shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-2 pt-[env(safe-area-inset-top)] sm:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <button type="button" onClick={() => setSidebarOpen(true)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden" aria-label={t('assignment.openHistory')}><ListIcon width={19} height={19} /></button>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{activeChat?.title ?? t('assignment.newChat')}</p>
              <p className="text-xs text-slate-500">{t('assignment.assistantDescription')} <span className="mx-1.5 text-slate-300">•</span> {t('assignment.anyLevel')}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {activeChat && activeChat.messages.length > 0 && (
              <>
                <button type="button" onClick={() => void downloadConversation()} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-blue-700" title={t('assignment.downloadPdf')} aria-label={t('assignment.downloadPdf')}><DownloadIcon width={18} height={18} /></button>
                <button type="button" onClick={clearConversation} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-red-600" title={t('assignment.clearConversation')} aria-label={t('assignment.clearConversation')}><TrashIcon width={18} height={18} /></button>
              </>
            )}
            <button type="button" disabled={!historyReady} onClick={createChat} className="ml-1 inline-flex items-center gap-2 rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-800 disabled:cursor-wait disabled:opacity-60">
              <PlusIcon width={16} height={16} /><span className="hidden sm:inline">{t('assignment.newChat')}</span>
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-4 sm:px-8 sm:py-6">
          {messages.length === 0 ? (
            <div className="mx-auto flex min-h-full max-w-3xl flex-col justify-center pb-10">
              <p className="text-sm font-bold uppercase tracking-[0.16em] text-blue-700">{t('assignment.eyebrow')}</p>
              <h1 className="mt-3 max-w-2xl text-3xl font-extrabold leading-tight tracking-tight text-slate-950 sm:text-5xl">{t('assignment.title')}</h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-slate-500">{t('assignment.subtitle')}</p>
              <div className="mt-8 grid gap-3 sm:grid-cols-2">
                {                [
                  [t('assignment.prompt1Title'), t('assignment.prompt1Hint')],
                  [t('assignment.prompt2Title'), t('assignment.prompt2Hint')],
                  [t('assignment.prompt3Title'), t('assignment.prompt3Hint')],
                  [t('assignment.prompt4Title'), t('assignment.prompt4Hint')],
                ].map(([title, hint]) => (
                  <button key={title} type="button" onClick={() => setDraft(hint)} className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md">
                    <span className="block text-sm font-semibold text-slate-800">{title}</span>
                    <span className="mt-1 block text-sm leading-5 text-slate-500">{hint}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-4xl space-y-7 pb-5">
              {messages.map((message, index) => (
                <article key={message.id} className={`flex gap-3 sm:gap-4 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`min-w-0 max-w-[88%] sm:max-w-[82%] ${message.role === 'user' ? 'rounded-2xl rounded-tr-md bg-[#173b77] px-4 py-3.5 text-white shadow-sm' : 'flex-1 rounded-2xl rounded-tl-md border border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-5'}`}>
                    {message.role === 'user' ? (
                      <>
                        {message.attachments && message.attachments.length > 0 && (
                          <div className="mb-2 flex flex-wrap gap-1.5">
                            {message.attachments.map((fileName) => <span key={fileName} className="max-w-full break-all rounded-full bg-white/15 px-2.5 py-1 text-xs">{fileName}</span>)}
                          </div>
                        )}
                        <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.content}</p>
                      </>
                    ) : (
                      <>
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-800">StudySmart</span>
                          {index === messages.length - 1 && <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-blue-700">{t('assignment.aiTutor')}</span>}
                        </div>
                        <div className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-700 sm:text-[15px]">{message.content}</div>
                        <div className="mt-4 flex flex-wrap items-center gap-1 border-t border-slate-100 pt-2">
                          <button type="button" onClick={() => void copyAnswer(message.content)} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800">{t('assignment.copy')}</button>
                          <button type="button" onClick={() => toggleSavedAnswer(message.id)} className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium hover:bg-slate-100 ${message.saved ? 'text-blue-700' : 'text-slate-500 hover:text-slate-800'}`}><SaveIcon width={14} height={14} /> {message.saved ? t('assignment.saved') : t('assignment.saveAnswer')}</button>
                          {index === messages.length - 1 && (
                            <button type="button" disabled={busy} onClick={() => void regenerate(index)} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50"><RefreshIcon width={14} height={14} /> {t('assignment.regenerate')}</button>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                  {message.role === 'user' && (
                    <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-200 text-sm font-bold text-slate-700">{t('assignment.you')}</div>
                  )}
                </article>
              ))}
              {busy && (
                <div className="flex items-start">
                  <div className="rounded-2xl rounded-tl-md border border-slate-200 bg-white px-5 py-4 shadow-sm">
                    <div className="flex items-center gap-2 text-sm text-slate-500"><span className="flex gap-1"><i className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-600 [animation-delay:-.25s]" /><i className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-600 [animation-delay:-.12s]" /><i className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-600" /></span> {t('assignment.thinking')}</div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-slate-200 bg-white/95 px-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2 backdrop-blur sm:px-8 sm:pb-5">
          <div className="mx-auto max-w-4xl">
            {(error || visibleStorageError) && (
              <div role="alert" className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <span>{error || visibleStorageError}</span>
                {retryRequest && <button type="button" disabled={busy} onClick={() => void retry()} className="inline-flex shrink-0 items-center gap-1.5 font-semibold underline underline-offset-2 disabled:opacity-50">{t('assignment.tryAgain')} <ArrowRightIcon width={14} height={14} /></button>}
              </div>
            )}
            {selectedFiles.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {selectedFiles.map((file, index) => (
                  <span key={`${file.name}-${index}`} className="inline-flex max-w-full items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-600">
                    {isAssignmentImage(file) ? <ImageIcon width={14} height={14} /> : <FileTextIcon width={14} height={14} />}
                    <span className="max-w-[200px] truncate">{file.name}</span>
                    <button type="button" onClick={() => setSelectedFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove ${file.name}`} className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-800"><XIcon width={13} height={13} /></button>
                  </span>
                ))}
              </div>
            )}
            <form onSubmit={(event) => void submit(event)} className="rounded-2xl border border-slate-300 bg-white p-2 shadow-[0_8px_28px_rgba(15,35,70,0.08)] transition focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-100/70">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void submit();
                  }
                }}
                aria-label={t('assignment.assistantDescription')}
                placeholder={mode === 'check_answer' ? t('assignment.checkAnswerPlaceholder') : t('assignment.messagePlaceholder')}
                rows={Math.min(5, Math.max(2, draft.split('\n').length))}
                disabled={!historyReady}
                className="max-h-40 min-h-[54px] w-full resize-y border-0 bg-transparent px-3 py-2 text-sm leading-6 text-slate-800 outline-none placeholder:text-slate-400 focus:ring-0 disabled:cursor-wait"
              />
              <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-1 pt-2">
                <input ref={fileInputRef} type="file" accept=".pdf,.docx,.txt,.md,image/jpeg,image/png,image/webp" multiple className="hidden" onChange={addFiles} disabled={!historyReady} />
                <input ref={cameraInputRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="hidden" onChange={addFiles} disabled={!historyReady} />
                <button type="button" disabled={!historyReady} onClick={() => fileInputRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-semibold text-slate-600 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-800 disabled:cursor-wait disabled:opacity-60">
                  <UploadIcon width={15} height={15} /><span className="hidden xs:inline">{t('assignment.attach')}</span>
                </button>
                <button type="button" disabled={!historyReady} onClick={() => {
                  if ('mediaDevices' in navigator && window.isSecureContext) setCameraOpen(true);
                  else cameraInputRef.current?.click();
                }} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-semibold text-slate-600 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-800 disabled:cursor-wait disabled:opacity-60" aria-label={language === 'fr' ? 'Prendre une photo' : 'Take a photo'}>
                  <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.5 4h-5L8 6H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-3l-1.5-2Z"/><circle cx="12" cy="12.5" r="3.5"/></svg>
                  <span className="hidden xs:inline">{language === 'fr' ? 'Photo' : 'Photo'}</span>
                </button>
                <label className="sr-only" htmlFor="assignment-answer-mode">{t('assignment.answerStyle')}</label>
                <select id="assignment-answer-mode" value={mode} onChange={(event) => setMode(event.target.value as AssignmentChatMode)} className="min-w-0 max-w-[190px] flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium text-slate-600 outline-none focus:border-blue-400 sm:flex-none">
                  {MODES.map((item) => <option key={item.value} value={item.value}>{modeLabels[item.value]}</option>)}
                </select>
                <span className="hidden text-[11px] text-slate-400 md:block">{answerCount} {language === 'fr' ? (answerCount === 1 ? 'réponse' : 'réponses') : (answerCount === 1 ? 'answer' : 'answers')} <span className="mx-1">•</span> {modeName}</span>
                <button type="submit" disabled={!historyReady || busy || (!draft.trim() && selectedFiles.length === 0)} className="ml-auto inline-flex items-center gap-2 rounded-xl bg-blue-700 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-300">
                  {busy || !historyReady ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" /> : <ArrowRightIcon width={16} height={16} />}
                  <span>{!historyReady ? t('assignment.loading') : busy ? t('assignment.working') : t('assignment.send')}</span>
                </button>
              </div>
            </form>
            <p className="mt-2 text-center text-[11px] leading-4 text-slate-400">{t('assignment.mistakeNotice')}</p>
          </div>
        </div>
      </main>
      {cameraOpen && (
        <CameraCapture
          onCapture={(file) => {
            setSelectedFiles((current) => {
              if (current.length >= 8) {
                setError(language === 'fr' ? 'Joignez au maximum huit fichiers à un message.' : 'Attach up to eight files to a message.');
                return current;
              }
              return [...current, file];
            });
            setCameraOpen(false);
          }}
          onClose={() => setCameraOpen(false)}
        />
      )}
    </div>
  );
}
