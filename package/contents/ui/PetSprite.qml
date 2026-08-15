import QtQuick 2.15

// PetSprite — renders an animated pet from an OpenPets spritesheet.
//
// Atlas layout (OpenPets format): 8 columns × 9 rows, each cell 192×208 px.
// Rows: idle(0), runningRight(1), runningLeft(2), waving(3), jumping(4),
//       failed(5), waiting(6), running(7), review(8)
//
// One-shot animations (waving, jumping, failed) return to idle when finished.
Item {
    id: root

    // ---- atlas constants (OpenPets) ----
    readonly property int cellW: 192
    readonly property int cellH: 208
    property int fps: 10            // animation speed (configurable via petFps)

    // ---- public API ----
    // NOTE: the status property is called petState, not state: Item already has a
    // `state` property (QML states) and shadowing it makes the binding ambiguous.
    property url source: ""          // spritesheet URL (local file)
    property int size: 96            // display width in px (height auto-scaled)
    property string petState: "idle" // idle | thinking | streaming | waiting | success | error | waving
    property bool reducedMotion: false

    // ---- animation table: name -> { row, frames } ----
    readonly property var anims: ({
        idle:         { row: 0, frames: 6 },
        runningRight: { row: 1, frames: 8 },
        runningLeft:  { row: 2, frames: 8 },
        waving:       { row: 3, frames: 4 },
        jumping:      { row: 4, frames: 5 },
        failed:       { row: 5, frames: 8 },
        waiting:      { row: 6, frames: 6 },
        running:      { row: 7, frames: 6 },
        review:       { row: 8, frames: 6 }
    })

    // ---- state -> animation mapping ----
    readonly property var stateMap: ({
        idle:      "idle",
        thinking:  "review",
        streaming: "running",
        waiting:   "waiting",
        testing:   "waiting",
        success:   "jumping",
        error:     "failed",
        waving:    "waving"
    })

    // ---- internal state ----
    property string currentAnim: "idle"
    property bool oneShot: false
    property bool dragOverride: false // when dragging, ignore external state changes
    property bool hoverOverride: false // when hovering, show the jumping animation

    width: size
    height: size * (cellH / cellW)

    // ---- sprite ----
    AnimatedSprite {
        id: sprite
        anchors.fill: parent
        source: root.source
        frameWidth: root.cellW
        frameHeight: root.cellH
        frameRate: root.fps
        interpolate: false
        frameX: 0
        frameY: 0
        frameCount: 6
        loops: Animation.Infinite
        running: true

        onFinished: {
            if (root.oneShot) {
                // one-shot animation completed — return to the current state
                Qt.callLater(root.setState, root.petState)
            }
        }
    }

    // ---- animation control ----
    function isOneShot(name) {
        return name === "waving" || name === "jumping" || name === "failed"
    }

    // loop: undefined = decide from isOneShot(); true = force looping (used by
    // setState, since a status animation must keep playing indefinitely).
    function setAnimation(name, force, loop) {
        if (!force && currentAnim === name) return
        if (reducedMotion) name = "idle"
        const a = anims[name] || anims.idle
        currentAnim = name
        oneShot = (loop === undefined) ? isOneShot(name) : !loop
        sprite.frameY = a.row * cellH
        sprite.frameCount = a.frames
        sprite.loops = oneShot ? 1 : Animation.Infinite
        // toggle running to reset currentFrame to 0 (start() resets it)
        sprite.running = false
        sprite.running = true
    }

    // Status animations always loop: states like error ("failed") or success
    // ("jumping") map to animations that are one-shot when triggered as an event,
    // but as a *state* they have to keep playing — otherwise the sprite stops on
    // the first frame and the pet freezes.
    function setState(stateName) {
        const anim = stateMap[stateName] || "idle"
        // force a restart when the sprite is stopped (a previous one-shot ended)
        setAnimation(anim, !sprite.running, true)
    }

    function wave() {
        setAnimation("waving", true)
    }

    // Drag support: lock the sprite to a walking animation while the pet is
    // being dragged, ignoring external state changes until stopDragging().
    function startDragging(direction) {
        dragOverride = true
        setAnimation(direction === "right" ? "runningRight" : "runningLeft", true)
    }

    function stopDragging() {
        dragOverride = false
        if (!hoverOverride) {
            setState(petState)
        }
    }

    // Hover support: while the pointer is over the pet it keeps jumping.
    function startHover() {
        hoverOverride = true
        setAnimation("jumping", true)
        sprite.loops = Animation.Infinite // keep jumping while hovering
    }

    // The pointer leaving the widget must not interrupt a walk or a drag —
    // otherwise the pet slides to its target playing the idle animation.
    function stopHover() {
        hoverOverride = false
        if (!dragOverride) {
            setState(petState)
        }
    }

    // react to external state changes (unless overridden by a drag or hover)
    onPetStateChanged: {
        if (!dragOverride && !hoverOverride) {
            setState(petState)
        }
    }

    Component.onCompleted: {
        setState(petState)
    }
}
