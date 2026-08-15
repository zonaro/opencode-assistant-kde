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
    readonly property int fps: 10

    // ---- public API ----
    property url source: ""          // spritesheet URL (local file)
    property int size: 96            // display width in px (height auto-scaled)
    property string state: "idle"    // idle | thinking | streaming | waiting | success | error | waving
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
                Qt.callLater(root.setState, root.state)
            }
        }
    }

    // ---- animation control ----
    function isOneShot(name) {
        return name === "waving" || name === "jumping" || name === "failed"
    }

    function setAnimation(name, force) {
        if (!force && currentAnim === name) return
        if (reducedMotion) name = "idle"
        const a = anims[name] || anims.idle
        currentAnim = name
        oneShot = isOneShot(name)
        sprite.frameY = a.row * cellH
        sprite.frameCount = a.frames
        sprite.loops = oneShot ? 1 : Animation.Infinite
        // toggle running to reset currentFrame to 0 (start() resets it)
        sprite.running = false
        sprite.running = true
    }

    function setState(stateName) {
        const anim = stateMap[stateName] || "idle"
        setAnimation(anim)
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
        setState(state)
    }

    // react to external state changes (unless overridden by a drag)
    onStateChanged: {
        if (!dragOverride) {
            setState(state)
        }
    }

    Component.onCompleted: {
        setAnimation("idle")
    }
}
