import { Button, ConfirmDialog, Container, containerClass } from "@/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { ReactPictureAnnotation } from "@/ui/annotation-tool/index";
import { useSession } from "next-auth/react";
import { clearSession } from "@/util/sessionCache";
import ProgressStrip from "@/features/annotate/ProgressStrip";
import MobileTopBar from "@/features/annotate/MobileTopBar";
import ContentSkeleton from "@/features/layout/contentSkeleton";
import { useAnnotateLayout, TOUCH_DEVICE_QUERY } from "@/hooks/useAnnotateLayout";
import { useIsPhone } from "@/hooks/useIsPhone";
import { useHideSiteChrome } from "@/features/layout/siteChrome";
import { requiresSidewalkMask } from "@/util/validators/sidewalkMask";

// A phone held sideways. Tablets are taller than 500 px and are not affected.
const SIDEWAYS_QUERY = "(orientation: landscape) and (max-height: 500px)";
// Moving to the next or previous image reloads the page. Full screen is kept
// across it: the time the page was left in full screen, in sessionStorage.
export const KEEP_FOCUS_KEY = "imprintFullScreenLeftAt";
const KEEP_FOCUS_MS = 15000;

/** A media query's live answer, false until it runs in the browser. */
function useMediaQuery(query) {
  const [match, setMatch] = useState(false);
  useEffect(() => {
    const list = window.matchMedia?.(query);
    if (!list) return undefined;
    setMatch(list.matches);
    if (!list.addEventListener) return undefined;
    const onChange = (event) => setMatch(event.matches);
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, [query]);
  return match;
}

/**
 * The annotation screen: the progress, Pause and Stop, and the tool.
 *
 * Two layouts (9 Oct 2026, IMPRINT_contributor_mobile.md section 4), for both
 * roles (annotators from 12 Oct 2026). From 1024 CSS px wide with a mouse,
 * the page as it was: the progress strip, the title and the tool. Under
 * 1024 px, and on every phone and tablet, one screen covering the page: a
 * slim top bar, the photo filling the screen and the answers in a bottom
 * sheet. The page under it does not scroll while it is
 * open, and the site's navbar and footer are not rendered.
 *
 * On phones and tablets the photo can also go full screen (12 Oct 2026): no
 * top bar, and the answers sheet down to its handle, to be pulled up. A phone
 * can be held sideways there. The tool stays mounted through every change, so nothing is lost,
 * and full screen is kept from one image to the next. A phone held sideways
 * outside full screen shows a notice with a way in.
 */
export default function AnnotateForm({
  data,
  current,
  total,
  allImages,
  isTutorial = false,
  isAnnotator = false,
  onAnnotatorStepChange,
  // The tutorial on a phone or tablet: shows the step's tour again (the top bar's ? button)
  onShowTour,
  // Told when the full-screen photo starts and ends (the tutorial holds its tour meanwhile)
  onFocusChange,
}) {
  const onSelect = () => { };
  const onChange = () => { };
  const { data: session, status } = useSession();
  const loading = status === "loading";
  const [showAbandonModal, setShowAbandonModal] = useState(false);
  const [showPauseModal, setShowPauseModal] = useState(false);
  // null until it runs in the browser. The sheet layout under 1024 px and on
  // every phone and tablet, for both roles (12 Oct 2026).
  const layout = useAnnotateLayout();
  const sheet = layout === "sheet";
  const sideways = useMediaQuery(SIDEWAYS_QUERY);
  const landscape = useMediaQuery("(orientation: landscape)");

  // The full-screen photo: phones and tablets (a finger as the primary
  // pointer), which always have the sheet layout. Never with a mouse.
  const phone = useIsPhone();
  const touchDevice = useMediaQuery(TOUCH_DEVICE_QUERY);
  const canFocus = sheet && touchDevice;
  const [focusOn, setFocusOn] = useState(false);
  const focus = focusOn && canFocus;
  const [sidewaysHint, setSidewaysHint] = useState(false);
  const hintTimer = useRef(null);
  const phoneRef = useRef(phone);
  phoneRef.current = phone;

  const leaveBrowserFullScreen = useCallback(() => {
    try {
      window.screen?.orientation?.unlock?.();
    } catch {
      // Not locked, or not supported
    }
    try {
      if (document.fullscreenElement) document.exitFullscreen?.()?.catch?.(() => {});
    } catch {
      // Not supported
    }
  }, []);

  /**
   * Asks the browser for its own full screen, and on a phone a sideways lock,
   * where they exist. Android Chrome has both, so a phone turns sideways and
   * the browser's bars go. iPhone Safari has neither, so there the person
   * turns the phone and Safari's bars stay. A tablet is never turned. Every
   * failure is ignored. The browser only allows this from a tap.
   */
  const askBrowser = useCallback(async () => {
    const isPhoneNow = phoneRef.current === true;
    let locked = false;
    try {
      await document.documentElement.requestFullscreen?.({ navigationUI: "hide" });
    } catch {
      // No element full screen (iPhone), or refused
    }
    if (!isPhoneNow) return;
    try {
      const lock = window.screen?.orientation?.lock?.("landscape");
      if (lock) {
        await lock;
        locked = true;
      }
    } catch {
      // Needs full screen, or not supported
    }
    // Still upright: say that sideways gives a bigger photo, for 3 seconds
    if (!locked && window.innerHeight > window.innerWidth) {
      setSidewaysHint(true);
      clearTimeout(hintTimer.current);
      hintTimer.current = setTimeout(() => setSidewaysHint(false), 3000);
    }
  }, []);

  const enterFocus = useCallback(() => {
    setFocusOn(true);
    return askBrowser();
  }, [askBrowser]);

  const exitFocus = useCallback(() => {
    setFocusOn(false);
    setSidewaysHint(false);
    leaveBrowserFullScreen();
  }, [leaveBrowserFullScreen]);

  // Next Image and Previous reload the page, which would drop full screen on
  // every image. The page says when it is left in full screen, and a page
  // that loads within a few seconds of that starts in it. The browser's own
  // full screen cannot be asked for without a tap, so the first tap asks.
  const focusRef = useRef(focus);
  focusRef.current = focus;
  useEffect(() => {
    const onLeave = () => {
      try {
        if (focusRef.current) window.sessionStorage.setItem(KEEP_FOCUS_KEY, String(Date.now()));
      } catch {
        // No storage: full screen is simply not kept
      }
    };
    window.addEventListener("pagehide", onLeave);
    return () => window.removeEventListener("pagehide", onLeave);
  }, []);
  const restored = useRef(false);
  useEffect(() => {
    if (!canFocus || restored.current) return;
    restored.current = true;
    let leftAt = NaN;
    try {
      leftAt = Number(window.sessionStorage.getItem(KEEP_FOCUS_KEY));
      window.sessionStorage.removeItem(KEEP_FOCUS_KEY);
    } catch {
      // No storage
    }
    const age = Date.now() - leftAt;
    if (!(leftAt > 0) || age < 0 || age > KEEP_FOCUS_MS) return;
    setFocusOn(true);
    setAskOnTap(true);
  }, [canFocus]);
  const [askOnTap, setAskOnTap] = useState(false);
  useEffect(() => {
    if (!askOnTap || !focus) return undefined;
    const onFirstTap = () => {
      setAskOnTap(false);
      askBrowser();
    };
    window.addEventListener("pointerup", onFirstTap, { once: true });
    return () => window.removeEventListener("pointerup", onFirstTap);
  }, [askOnTap, focus, askBrowser]);

  const onFocusChangeRef = useRef(onFocusChange);
  onFocusChangeRef.current = onFocusChange;
  const toldFocus = useRef(false);
  useEffect(() => {
    if (toldFocus.current === focus) return;
    toldFocus.current = focus;
    onFocusChangeRef.current?.(focus);
  }, [focus]);

  // The browser left its own full screen (the Android back gesture): leave ours too
  useEffect(() => {
    if (!focus) return undefined;
    const onChange = () => {
      if (!document.fullscreenElement) exitFocus();
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [focus, exitFocus]);

  // No longer a touch device (a mouse plugged in), or the form is going away
  useEffect(() => {
    if (focusOn && !canFocus) exitFocus();
  }, [focusOn, canFocus, exitFocus]);
  useEffect(
    () => () => {
      clearTimeout(hintTimer.current);
      leaveBrowserFullScreen();
    },
    [leaveBrowserFullScreen]
  );

  // The phone screen covers the page, but the site's navbar is `relative z-50`
  // and was painted over the top bar: its logo over "Sidewalk 1 of 3" and its
  // menu over Pause and Stop (12 Oct 2026). So the navbar and footer are not
  // rendered while the sheet layout is up, and come back on the desktop layout.
  useHideSiteChrome(sheet);

  // The full-screen surface: the page under it must not scroll
  useEffect(() => {
    if (!sheet) return undefined;
    const html = document.documentElement;
    const body = document.body;
    const before = [html.style.overflow, body.style.overflow];
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      html.style.overflow = before[0];
      body.style.overflow = before[1];
    };
  }, [sheet]);

  if (loading) return null;
  if (layout === null) return <ContentSkeleton />;

  const dialogs = (
    <>
      <ConfirmDialog
        open={showPauseModal}
        title="Pause Session?"
        description="Your submitted images are saved, and so is your work on this image on this device. Resume from the dashboard to pick up where you left off."
        confirmLabel="Pause & Exit"
        onCancel={() => setShowPauseModal(false)}
        onConfirm={async () => {
          try {
            await fetch("/api/updateSessionCount", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ currentAnnotationCount: current }),
            });
            // The session cache is kept (8 Oct 2026): it holds the current
            // image's unsubmitted boxes and answers, which Resume restores on
            // this device. The tool saves a waiting edit as the page is left.
            window.location.href = "/contribute";
          } catch (e) {
            console.error(e);
          }
        }}
      />

      <ConfirmDialog
        open={showAbandonModal}
        title={isTutorial ? "Stop Tutorial?" : "Stop Session?"}
        description={isTutorial
          ? "Are you sure you want to stop the tutorial? You can replay it anytime from the dashboard."
          : "Are you sure you want to stop this session? Images you have already submitted will be saved, but progress on the current image will be lost."
        }
        confirmLabel={isTutorial ? "Yes, Stop Tutorial" : "Yes, Stop Session"}
        destructive
        onCancel={() => setShowAbandonModal(false)}
        onConfirm={async () => {
          try {
            if (!isTutorial) {
              await fetch("/api/annotationAbandon", { method: "POST" });
            }
            clearSession();
            window.location.href = "/contribute";
          } catch (e) {
            console.error(e);
          }
        }}
      />
    </>
  );

  const tool = (
    <ReactPictureAnnotation
      image={data.url}
      onSelect={onSelect}
      onChange={onChange}
      width={640 * 1.5}
      height={400 * 1.5}
      annotationData={data.annotationList}
      imageID={data.imageID}
      city={data.city}
      servedModelVersion={data.modelVersion}
      isReference={data.isReference ?? false}
      currentAnnotationCount={current}
      totalAnnotationCount={total}
      username={session?.user?.username ?? ""}
      isAnnotator={isAnnotator}
      // Model-development images get the Sidewalk step. The tutorial always
      // shows it to annotators, so they practise it (6 Oct 2026).
      askSidewalk={isAnnotator && (isTutorial || requiresSidewalkMask(data))}
      onAnnotatorStepChange={onAnnotatorStepChange}
      layout={layout}
      focus={focus}
      onEnterFocus={canFocus ? enterFocus : undefined}
      onExitFocus={exitFocus}
    />
  );

  // One tree for both layouts, with the tool at the same place in it, so a
  // window resized across 1024 px keeps the tool, its selection and its
  // timers. A different wrapper per layout would rebuild the tool.
  return (
    // The phone screen never scrolls (data-no-scroll, overflow clip): only the
    // answers sheet's list does. See scrollSheetTo in the tool.
    <div
      data-no-scroll={sheet ? "" : undefined}
      className={sheet ? "annotate-sheet-screen fixed inset-0 z-40 flex flex-col overflow-hidden" : undefined}
      style={sheet ? { overflow: "clip" } : undefined}
    >
      {dialogs}
      {sheet ? (
        // No top bar in full screen: the photo is the whole screen
        !focus && (
          <MobileTopBar
            current={current}
            total={total}
            onPause={() => setShowPauseModal(true)}
            onStop={() => setShowAbandonModal(true)}
            onShowTour={onShowTour}
            isTutorial={isTutorial}
          />
        )
      ) : (
        <Container width="wide" className="pt-3">
          {/* Netflix-style progress strip */}
          <ProgressStrip
            images={allImages || []}
            current={current}
            total={total}
            onPause={() => setShowPauseModal(true)}
            onStop={() => setShowAbandonModal(true)}
            isTutorial={isTutorial}
          />

          {/* Title */}
          <h1 className="font-display text-4xl lg:text-5xl font-extrabold text-ink text-center tracking-tight mb-8">
            Sidewalk #{current}
          </h1>
        </Container>
      )}
      <div data-no-scroll={sheet ? "" : undefined} className={sheet ? "relative flex-1 min-h-0 flex flex-col" : containerClass("wide", "pb-3")}>
        {tool}
      </div>
      {/* Gone as soon as the phone is turned */}
      {focus && phone === true && sidewaysHint && !landscape && (
        <p
          role="status"
          className="pointer-events-none absolute left-1/2 -translate-x-1/2 z-50 px-3 py-2 rounded-full bg-ink/80 text-white text-xs font-semibold whitespace-nowrap"
          style={{ top: "calc(max(12px, env(safe-area-inset-top)) + 56px)" }}
        >
          Turn your phone sideways for a bigger photo.
        </p>
      )}
      {/* A phone held sideways: the answers need it upright. Not in full
          screen, which is made for sideways. The tool stays mounted under this. */}
      {sheet && sideways && !focus && (
        <div role="status" className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 px-8 bg-ink text-white text-center">
          <svg aria-hidden="true" className="w-12 h-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <rect x="7" y="2.5" width="10" height="19" rx="2" />
            <path d="M11 18.5h2" />
            <path d="M20.5 9a8.5 8.5 0 0 0-3-5.5M20.5 9l-2.6-.6M20.5 9l.6-2.6" />
          </svg>
          {canFocus ? (
            <>
              <p className="text-base font-semibold">Turn your phone upright, or annotate sideways in full screen.</p>
              <Button onClick={enterFocus}>Annotate in full screen</Button>
            </>
          ) : (
            <p className="text-base font-semibold">Turn your phone upright to annotate.</p>
          )}
        </div>
      )}
    </div>
  );
}
